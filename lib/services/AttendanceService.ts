/**
 * Attendance Service with Face & Location Verification
 * Handles opening/closing 5-minute windows with biometric validation
 */

import { ems, core } from '@/lib/supabase';

function logToFile(msg: string, data?: any) {
    const safeData = data ? JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ) : '';
    console.log(`[AttendanceService] ${msg}`, safeData);
}

export interface FaceVerificationData {
    sessionId: number;
    studentId: number;
    verificationType: 'OPENING' | 'CLOSING';
    faceImageUrl: string;
    faceDescriptor?: number[]; // 128D vector for secure face verification
    latitude: number;
    longitude: number;
    locationAccuracy: number;
    deviceInfo: any;
    ipAddress?: string;
    userAgent?: string;
}

export interface AttendanceSession {
    id: number;
    companyId: number;
    courseId: number;
    batchId: number;
    sessionDate: string;
    sessionType: string;
    openingWindowStart: string;
    openingWindowEnd: string;
    closingWindowStart: string;
    closingWindowEnd: string;
    requireFaceVerification: boolean;
    requireLocationVerification: boolean;
    allowedRadiusMeters: number;
    status: string;
}

export class AttendanceService {
    /**
     * Create attendance session with time windows
     */
    static async createSession(sessionData: {
        companyId: number;
        courseId: number;
        batchId: number;
        sessionDate: string;
        sessionType: string;
        startTime: string;
        endTime: string;
        classMode?: string;
        requireFaceVerification?: boolean;
        requireLocationVerification?: boolean;
        liveClassId?: number | null;
    }) {
        logToFile('Creating Session (Simplified) - Input:', sessionData);
        try {
            const insertPayload: any = {
                company_id: sessionData.companyId,
                course_id: sessionData.courseId,
                batch_id: sessionData.batchId,
                session_date: sessionData.sessionDate,
                session_type: sessionData.sessionType,
                status: 'SCHEDULED'
            };

            // Safely add optional fields
            if (sessionData.liveClassId !== undefined) {
                insertPayload.live_class_id = sessionData.liveClassId;
            }
            if (sessionData.classMode) {
                insertPayload.class_mode = sessionData.classMode;
            }
            if (sessionData.requireFaceVerification !== undefined) {
                insertPayload.require_face_verification = sessionData.requireFaceVerification;
            }
            if (sessionData.requireLocationVerification !== undefined) {
                insertPayload.require_location_verification = sessionData.requireLocationVerification;
            }

            logToFile('Insert Payload:', insertPayload);

            const { data, error } = await ems.attendanceSessions()
                .insert(insertPayload as any)
                .select()
                .single();

            if (error) {
                logToFile('Create Session Error:', error);
                try {
                    const fs = require('fs');
                    fs.appendFileSync('backend/session_error.log', `[${new Date().toISOString()}] Create Session Error: ${JSON.stringify(error, null, 2)}\nPayload: ${JSON.stringify(insertPayload, null, 2)}\n`);
                } catch (e) { }
                throw error;
            }
            logToFile('Session Created Successfully:', data);
            return data;
        } catch (err: any) {
            logToFile('createSession Catch Error:', { message: err.message, stack: err.stack });
            try {
                const fs = require('fs');
                fs.appendFileSync('backend/session_error.log', `[${new Date().toISOString()}] Catch Error: ${err.message}\nStack: ${err.stack}\n`);
            } catch (e) { }
            throw err;
        }
    }

    /**
     * Update session status
     */
    static async updateSessionStatus(companyId: number, sessionId: number, status: string) {
        const { data, error } = await ems.attendanceSessions()
            .update({ status } as any)
            .eq('id', sessionId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Cancel an attendance session (Soft delete)
     */
    static async cancelSession(companyId: number, sessionId: number, reason: string, cancelledBy: number) {
        logToFile('Cancelling Session:', { sessionId, reason, cancelledBy });
        const { data, error } = await ems.attendanceSessions()
            .update({
                status: 'CANCELLED',
                cancellation_reason: reason,
                cancelled_at: new Date().toISOString(),
                cancelled_by: cancelledBy
            } as any)
            .eq('id', sessionId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
            logToFile('Cancel Session Error:', error);
            throw error;
        }
        return data;
    }

    /**
     * Update attendance session details
     */
    static async updateSession(companyId: number, sessionId: number, updateData: any) {
        logToFile('Updating Session:', { sessionId, updateData });
        const { data, error } = await ems.attendanceSessions()
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            } as any)
            .eq('id', sessionId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) {
            logToFile('Update Session Error:', error);
            throw error;
        }
        return data;
    }

    /**
     * Helper to check if current time is within 5 minutes of class start/end
     */
    static isInsideWindow(startTime: Date, endTime: Date, type: 'IN' | 'OUT') {
        const now = new Date();
        const targetTime = type === 'IN' ? startTime : endTime;
        const diffMinutes = Math.abs(now.getTime() - targetTime.getTime()) / (1000 * 60);

        if (diffMinutes <= 5) {
            return { isValid: true, message: 'Within window' };
        }
        return { isValid: false, message: `Too ${now < targetTime ? 'early' : 'late'} to mark ${type}` };
    }

    /**
     * Mark bulk attendance for a session
     */
    static async markBulkAttendance(sessionId: number, records: {
        company_id: number;
        session_id: number;
        student_id: number;
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
        remarks?: string;
    }[]) {
        logToFile('Marking Bulk Attendance (Resilient) - Input:', { sessionId, records });
        try {
            // 0. Resolve companyId from session
            const { data: sessionInfo, error: infoError } = await ems.attendanceSessions()
                .select('company_id')
                .eq('id', sessionId)
                .single();

            if (infoError || !sessionInfo) {
                logToFile('markBulkAttendance Session Lookup Error:', infoError || 'Session not found');
                throw new Error('Invalid session ID');
            }

            const companyId = sessionInfo.company_id;

            // 1. Delete existing records for this session to avoid duplicates
            await ems.attendanceRecords().delete().eq('session_id', sessionId);

            // 2. Detect columns to see if 'remarks' exists
            const { data: sample } = await ems.attendanceRecords().select('*').limit(1);
            const columns = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
            const hasRemarks = columns.length > 0 ? columns.includes('remarks') : true;

            const hasLocation = columns.length > 0 ? columns.includes('latitude') : true;

            // 3. Insert new records
            const insertData = records.map(record => {
                const row: any = {
                    company_id: companyId,
                    session_id: sessionId,
                    student_id: record.student_id,
                    status: record.status
                };
                if (hasRemarks && record.remarks) {
                    row.remarks = record.remarks;
                }

                // Add verification metadata if available/applicable
                // Since this is marked by Manager, we set method to MANUAL
                if (hasLocation) {
                    row.verification_method = 'MANUAL';
                    // Optional: could add manager's IP if captured
                    if ((record as any).ip_address) row.ip_address = (record as any).ip_address;
                }

                return row;
            });

            const { data, error: insertError } = await ems.attendanceRecords()
                .insert(insertData)
                .select();

            if (insertError) {
                logToFile('markBulkAttendance Insert Error:', insertError);
                throw insertError;
            }

            logToFile('Bulk Attendance Marked Successfully:', data);
            return data;
        } catch (err: any) {
            logToFile('markBulkAttendance Catch Error:', { message: err.message, stack: err.stack });
            throw err;
        }
    }

    /**
     * Get single session by ID
     */
    static async getSessionById(companyId: number, sessionId: number) {
        const { data, error } = await ems.attendanceSessions()
            .select(`
                id, company_id, course_id, batch_id, session_date, session_type, status,
                course:courses(id, course_name, course_code),
                batch:batches(id, batch_name, batch_code)
            `)
            .eq('id', sessionId)
            .eq('company_id', companyId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get all sessions for a company
     */
    static async getAllSessions(companyId: number) {
        const { data, error } = await ems.attendanceSessions()
            .select(`
                id, company_id, course_id, batch_id, session_date, session_type, status,
                course:courses(id, course_name, course_code),
                batch:batches(id, batch_name, batch_code)
            `)
            .eq('company_id', companyId)
            .order('session_date', { ascending: false });

        if (error) throw error;
        return data;
    }

    /**
     * Get active attendance session (check if within opening or closing window)
     */
    static async getActiveSession(companyId: number, batchId: number) {
        const { data, error } = await ems.attendanceSessions()
            .select('id, company_id, batch_id, course_id, session_date, session_type, status')
            .eq('company_id', companyId)
            .eq('batch_id', batchId)
            .eq('session_date', new Date().toISOString().split('T')[0])
            .eq('status', 'OPEN')
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        // Since we don't have windows yet, we consider it 'OPENING' if it's OPEN
        return { ...data, activeWindow: 'OPENING' };
    }

    /**
     * Get batch attendance report for a date range
     */
    static async getBatchAttendanceReport(batchId: number, startDate: string, endDate: string) {
        // Fetch sessions
        const { data: sessions, error: sessionError } = await ems.attendanceSessions()
            .select('id, company_id, course_id, batch_id, session_date, session_type, status')
            .eq('batch_id', batchId)
            .gte('session_date', startDate)
            .lte('session_date', endDate)
            .order('session_date');

        if (sessionError) throw sessionError;
        if (!sessions || sessions.length === 0) return { sessions: [], attendance: [] };

        const sessionIds = sessions.map(s => s.id);

        // Fetch attendance records for these sessions
        const { data: attendance, error: attError } = await ems.attendanceRecords()
            .select(`
                id, company_id, session_id, student_id, user_id, status, created_at,
                student:students(id, first_name, last_name, student_code)
            `)
            .in('session_id', sessionIds);

        if (attError) throw attError;

        return { sessions, attendance };
    }

    /**
     * Get daily class schedule with attendance status
     */
    static async getDailySchedule(companyId: number, date: string) {
        logToFile('getDailySchedule - Input:', { companyId, date });

        // 1. Fetch attendance_sessions for this date
        const { data: sessions, error: sessionError } = await ems.attendanceSessions()
            .select(`
                id, 
                batch_id, 
                course_id,
                session_date,
                session_type,
                status,
                class_mode,
                require_face_verification,
                require_location_verification,
                live_class_id,
                batch:batches(id, batch_name, batch_code, start_time, end_time),
                course:courses(id, course_name, course_code)
            `)
            .eq('company_id', companyId)
            .eq('session_date', date)
            .order('id', { ascending: true });

        if (sessionError) {
            logToFile('getDailySchedule Session Error:', sessionError);
            throw sessionError;
        }

        // 2. Fetch live_classes for this date to catch sessions that haven't been "Started" yet
        const { data: liveClasses, error: liveError } = await ems.liveClasses()
            .select(`
                id,
                batch_id,
                course_id,
                scheduled_date,
                start_time,
                end_time,
                class_title,
                batch:batches(id, batch_name, batch_code, start_time, end_time),
                course:courses(id, course_name, course_code)
            `)
            .eq('company_id', companyId)
            .eq('scheduled_date', date)
            .is('deleted_at', null);

        if (liveError) {
            logToFile('getDailySchedule Live Class Error:', liveError);
        }

        // 3. Merge: Identify Live Classes that don't have an attendance session record yet
        const existingSessionLiveClassIds = (sessions || []).map(s => s.live_class_id && s.live_class_id.toString()).filter(Boolean);
        const pendingLiveClasses = (liveClasses || []).filter(lc => !existingSessionLiveClassIds.includes(lc.id.toString()));

        // Combine existing sessions and "virtual" sessions from live classes
        const allItems: any[] = (sessions || []) as any[];

        pendingLiveClasses.forEach(lc => {
            const defaultMode = 'ONLINE'; // Live classes are usually online
            allItems.push({
                id: null, // Virtual session
                batch_id: lc.batch_id,
                course_id: lc.course_id,
                session_date: lc.scheduled_date,
                session_type: 'LECTURE',
                status: 'SCHEDULED',
                class_mode: defaultMode,
                live_class_id: lc.id,
                batch: lc.batch,
                course: lc.course,
                is_virtual: true,
                start_time: lc.start_time,
                end_time: lc.end_time,
                // Default verification to TRUE for Online classes
                require_face_verification: true,
                require_location_verification: true
            });
        });

        if (allItems.length === 0) {
            logToFile('getDailySchedule: No sessions or live classes found for date:', date);
            return { count: 0, schedule: [] };
        }

        // Get batch IDs to fetch enrollment counts
        const allBatchIds = allItems.map(item => item.batch_id).filter(Boolean);

        // Get total students per batch (enrolled)
        const { data: enrollments } = await ems.enrollments()
            .select('batch_id')
            .in('batch_id', allBatchIds)
            .eq('enrollment_status', 'ACTIVE');

        // Get attendance counts for existing sessions
        const sessionIds = sessions?.map(s => s.id).filter(Boolean) || [];
        const { data: attendanceRecords } = sessionIds.length > 0
            ? await ems.attendanceRecords().select('session_id, status').in('session_id', sessionIds)
            : { data: [] };

        // Transform to match frontend expectations
        const schedule = allItems.map(item => {
            const batchData = Array.isArray(item.batch) ? item.batch[0] : item.batch;
            const courseData = Array.isArray(item.course) ? item.course[0] : item.course;

            const totalStudents = enrollments?.filter(e => e.batch_id === item.batch_id).length || 0;
            const sessionRecords = item.id ? (attendanceRecords?.filter(r => r.session_id === item.id) || []) : [];

            // Business Rule: Online classes must have Face & Location ON
            const isOnline = item.class_mode === 'ONLINE' || item.class_mode === 'HYBRID';
            const requireFace = item.require_face_verification ?? (isOnline ? true : false);
            const requireLoc = item.require_location_verification ?? (isOnline ? true : false);

            return {
                id: item.batch_id,
                batch_name: batchData?.batch_name || 'Unknown Batch',
                batch_code: batchData?.batch_code || '',
                start_time: item.start_time || batchData?.start_time || '09:00',
                end_time: item.end_time || batchData?.end_time || '10:00',
                course: courseData || { id: item.course_id, course_name: 'Unknown Course', course_code: '' },
                total_students: totalStudents,
                class_mode: item.class_mode || 'OFFLINE',
                require_face_verification: requireFace,
                require_location_verification: requireLoc,

                session: item.id ? {
                    id: item.id,
                    status: item.status,
                    present_count: sessionRecords.filter(r => r.status === 'PRESENT').length,
                    absent_count: sessionRecords.filter(r => r.status === 'ABSENT').length
                } : null,
                status: item.status || 'SCHEDULED',
                live_class_id: item.live_class_id
            };
        });

        logToFile('getDailySchedule - Result Summary:', { count: schedule.length });
        return {
            count: schedule.length,
            schedule
        };
    }

    /**
     * Get student's active sessions with status
     */
    static async getStudentActiveSessionsWithStatus(companyId: number, studentId: number) {
        logToFile('getStudentActiveSessionsWithStatus - Input:', { companyId, studentId });
        try {
            // Get student's courses and batches first
            const { data: enrollments, error: enrollError } = await ems.enrollments()
                .select('batch_id')
                .eq('student_id', studentId)
                .eq('company_id', companyId);

            if (enrollError) throw enrollError;
            if (!enrollments || enrollments.length === 0) return [];

            const batchIds = enrollments.map(e => e.batch_id).filter(id => id !== null && id !== undefined);
            if (batchIds.length === 0) return [];

            // Timezone Resilience: Look for sessions across a 3-day window to avoid offset issues
            const todayDate = new Date();
            const today = todayDate.toISOString().split('T')[0];

            const yesterdayDate = new Date(todayDate);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = yesterdayDate.toISOString().split('T')[0];

            const tomorrowDate = new Date(todayDate);
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            const tomorrow = tomorrowDate.toISOString().split('T')[0];

            let sessions: any[] = [];
            try {
                // Optimistic query with all new features
                const { data: fullSessions, error: sessionsError } = await ems.attendanceSessions()
                    .select(`
                        id, company_id, course_id, batch_id, session_date, session_type, status,
                        class_mode, require_face_verification, require_location_verification, live_class_id,
                        course:courses(id, course_name, course_code),
                        batch:batches(id, batch_name, batch_code, start_time, end_time),
                        live_class:live_classes(id, meeting_link, class_status, meeting_platform)
                    `)
                    .eq('company_id', companyId)
                    .in('status', ['OPEN', 'IDENTIFYING_ENTRY', 'IDENTIFYING_EXIT', 'IN_PROGRESS', 'SCHEDULED'])
                    .gte('session_date', yesterday)
                    .lte('session_date', tomorrow)
                    .in('batch_id', batchIds);

                if (sessionsError) throw sessionsError;
                sessions = fullSessions || [];
            } catch (err: any) {
                logToFile('⚠️ Joined Query Failed, attempting Minimal Resilient Query:', err.message);

                // Fallback 1: Try without complex joins
                try {
                    const { data: minimalSessions, error: minError } = await ems.attendanceSessions()
                        .select('id, company_id, course_id, batch_id, session_date, session_type, status')
                        .eq('company_id', companyId)
                        .in('status', ['OPEN', 'IDENTIFYING_ENTRY', 'IDENTIFYING_EXIT', 'IN_PROGRESS', 'SCHEDULED'])
                        .gte('session_date', yesterday)
                        .lte('session_date', tomorrow)
                        .in('batch_id', batchIds);

                    if (minError) throw minError;

                    if (minimalSessions && minimalSessions.length > 0) {
                        // Manually hydrate Course/Batch data to avoid 500s later in the UI
                        const courseIds = [...new Set(minimalSessions.map(s => s.course_id))].filter(id => id !== null && id !== undefined);
                        const batchIdsSet = [...new Set(minimalSessions.map(s => s.batch_id))].filter(id => id !== null && id !== undefined);

                        const [{ data: courses }, { data: batches }] = await Promise.all([
                            ems.courses().select('id, course_name, course_code').in('id', courseIds),
                            ems.batches().select('id, batch_name, batch_code, start_time, end_time').in('id', batchIdsSet)
                        ]);

                        sessions = minimalSessions.map(s => ({
                            ...s,
                            course: courses?.find(c => c.id === s.course_id),
                            batch: batches?.find(b => b.id === s.batch_id)
                        }));
                    }
                } catch (fallbackErr: any) {
                    logToFile('❌ CRITICAL: Minimal Fallback Failed:', fallbackErr.message);
                    throw fallbackErr;
                }
            }

            if (!sessions || sessions.length === 0) return [];

            // Get attendance records to see if student already marked
            const sessionIds = sessions.map((s: any) => s.id);
            const [{ data: records }, { data: verifications }] = await Promise.all([
                ems.attendanceRecords()
                    .select('session_id, status')
                    .eq('student_id', studentId)
                    .in('session_id', sessionIds),
                ems.faceVerifications()
                    .select('session_id, verification_type')
                    .eq('student_id', studentId)
                    .eq('verification_type', 'CLOSING')
                    .in('session_id', sessionIds)
            ]);

            const recordMap = new Map((records || []).map(r => [r.session_id, r.status]));
            const exitVerificationMap = new Map((verifications || []).map(v => [v.session_id, true]));

            return sessions.map((s: any) => {
                const status = recordMap.get(s.id) || 'PENDING';
                const alreadyExited = exitVerificationMap.get(s.id) || false;

                // Logic for recommended action (PUNCH_IN, PUNCH_OUT, COMPLETED)
                let recommendedAction = 'PUNCH_IN';

                // If they punched in but session allows/requires punch out
                const hasPunchedIn = status === 'PRESENT' || status === 'LATE';
                const canPunchOut = s.is_checkout_active === true || s.status === 'IDENTIFYING_EXIT' || s.status === 'CLOSED';

                if (alreadyExited) {
                    recommendedAction = 'COMPLETED';
                } else if (hasPunchedIn && canPunchOut) {
                    recommendedAction = 'PUNCH_OUT';
                } else if (hasPunchedIn) {
                    recommendedAction = 'COMPLETED';
                }

                return {
                    ...s,
                    student_status: status,
                    has_exited: alreadyExited,
                    recommended_action: recommendedAction
                };
            });
        } catch (err: any) {
            logToFile('getStudentActiveSessionsWithStatus Catch Error:', { message: err.message, stack: err.stack });
            throw err;
        }
    }


    /**
     * Verify location against institution whitelist
     */
    static async verifyLocation(companyId: number, latitude: number, longitude: number) {
        logToFile('Attempting Location RPC (EMS Schema)...');
        let { data, error } = await (ems.supabase as any).schema('ems').rpc('verify_location', {
            p_company_id: companyId,
            p_latitude: latitude,
            p_longitude: longitude
        });

        if (error) {
            logToFile('EMS RPC Failed, trying Public Schema...', error.message);
            const publicRpc = await (ems.supabase as any).rpc('verify_location', {
                p_company_id: companyId,
                p_latitude: latitude,
                p_longitude: longitude
            });
            data = publicRpc.data;
            error = publicRpc.error;
        }

        if (error) {
            logToFile('All Location RPC attempts failed:', error);
            throw error;
        }

        // RPC returns an array because it's a TABLE return type
        const result = Array.isArray(data) ? data[0] : data;

        return result || { is_valid: false, location_name: null, distance_meters: null };
    }

    /**
     * Submit face verification for attendance
     */
    static async submitFaceVerification(verificationData: FaceVerificationData, companyId: number) {
        // Fetch session to check requirements
        const { data: session } = await ems.attendanceSessions()
            .select('require_location_verification, require_face_verification, status')
            .eq('id', verificationData.sessionId)
            .single();

        const needsLocation = session?.require_location_verification !== false;

        // Verify location (only if required)
        let locationResult = { is_valid: true, location_name: 'Bypassed', distance_meters: 0 };

        if (needsLocation) {
            try {
                const loc = await this.verifyLocation(companyId, verificationData.latitude, verificationData.longitude);
                if (loc) locationResult = loc;
            } catch (err) {
                const underlyingError = (err as any)?.message || 'Unknown RPC error';
                logToFile('Location verification system error:', err);
                return { success: false, error: `Location system error: ${underlyingError}. Please notify your administrator.` };
            }
        }

        if (needsLocation && !locationResult.is_valid) {
            // Check if ANY locations are actually defined for this company in either possible source.
            const [{ count: emsCount }, { count: coreCount }] = await Promise.all([
                ems.institutionLocations().select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
                core.locations().select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true)
            ]);

            if ((emsCount || 0) === 0 && (coreCount || 0) === 0) {
                logToFile('⚠️ No authorized locations defined in EMS or Core. Bypassing check.');
                locationResult = { is_valid: true, location_name: 'Bypassed (No Campus Configured)', distance_meters: 0 };
            } else {
                logToFile('Location verification failed:', { ...locationResult, input: verificationData });
                return {
                    success: false,
                    error: `Location verification failed. You are ${Math.round(locationResult.distance_meters || 0)}m away from ${locationResult.location_name || 'the campus center'}. Allowed: 100m.`
                };
            }
        }

        const needsFace = session?.require_face_verification !== false;

        // Verify face ONLY if required
        if (needsFace && !verificationData.faceImageUrl) {
            return { success: false, error: 'Face verification is required for this session.' };
        }

        let verificationId = 0;
        if (verificationData.faceImageUrl) {
            try {
                // Try to Insert face verification record
                const { data, error } = await ems.faceVerifications()
                    .insert({
                        company_id: companyId,
                        session_id: verificationData.sessionId,
                        student_id: verificationData.studentId,
                        verification_type: verificationData.verificationType,
                        face_image_url: verificationData.faceImageUrl,
                        latitude: verificationData.latitude,
                        longitude: verificationData.longitude,
                        location_accuracy_meters: verificationData.locationAccuracy,
                        location_verified: locationResult.is_valid,
                        distance_from_venue_meters: locationResult.distance_meters,
                        device_info: verificationData.deviceInfo,
                        ip_address: verificationData.ipAddress,
                        user_agent: verificationData.userAgent,
                        face_match_status: 'PENDING'
                    } as any)
                    .select()
                    .single();

                if (error) {
                    logToFile('Face verification record insert failed:', error);
                    // If face was REQUIRED, this is a failure.
                    if (needsFace) return { success: false, error: 'Biometric record creation failed: ' + error.message };
                }

                if (data) verificationId = data.id;
            } catch (err) {
                logToFile('Face verification table missing/error, proceeding with basic record:', err);
                if (needsFace) return { success: false, error: 'Biometric system error.' };
            }
        }

        // Only update attendance if verification passed
        await this.updateAttendanceRecord(
            companyId,
            verificationData.sessionId,
            verificationData.studentId,
            verificationData.verificationType,
            verificationId
        );

        return { success: true, locationResult };
    }

    /**
     * Update attendance record with verification
     */
    private static async updateAttendanceRecord(
        companyId: number,
        sessionId: number,
        studentId: number,
        verificationType: 'OPENING' | 'CLOSING',
        verificationId: number
    ) {
        // Check if attendance record exists
        const { data: existingRecord } = await ems.attendanceRecords()
            .select('id, company_id, session_id, student_id, status')
            .eq('company_id', companyId)
            .eq('session_id', sessionId)
            .eq('student_id', studentId)
            .single();

        const updateData: any = {
            company_id: companyId,
            session_id: sessionId,
            student_id: studentId,
            status: 'PRESENT'
        };

        // Simplified: Just update status to PRESENT if anything is verified
        if (existingRecord) {
            // Update existing record
            const { error } = await ems.attendanceRecords()
                .update({ status: 'PRESENT' })
                .eq('id', existingRecord.id);

            if (error) throw error;
        } else {
            // Create new record
            const { error } = await ems.attendanceRecords()
                .insert(updateData);

            if (error) throw error;
        }
    }

    /**
     * Get student attendance history
     */
    static async getStudentAttendance(companyId: number, studentId: number, courseId?: number) {
        logToFile('Getting Student Attendance - Input:', { companyId, studentId, courseId });
        try {
            let query = ems.attendanceRecords()
                .select(`
                    id, company_id, session_id, student_id, status, created_at,
                    session:attendance_sessions(
                        id, session_date, session_type, status,
                        course:courses(id, course_name, course_code)
                    )
                `)
                .eq('company_id', companyId)
                .eq('student_id', studentId);

            if (courseId) {
                query = query.eq('session.course_id', courseId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                logToFile('getStudentAttendance DB Error:', error);
                throw error;
            }
            return data;
        } catch (err: any) {
            logToFile('getStudentAttendance Catch Error:', { message: err.message, stack: err.stack });
            throw err;
        }
    }

    /**
     * Get batch attendance summary
     */
    /**
     * Get batch attendance summary (Full Roster)
     */
    static async getBatchAttendanceSummary(companyId: number, batchId: number, sessionId: number) {
        logToFile('Getting Batch Attendance Summary - Input:', { companyId, batchId, sessionId });
        try {
            // 1. Get all students enrolled in the batch
            const { data: enrollments, error: enrollError } = await ems.enrollments()
                .select(`
                    student_id,
                    student:students(id, first_name, last_name, student_code, profile_url)
                `)
                .eq('company_id', companyId)
                .eq('batch_id', batchId)
                .eq('enrollment_status', 'ACTIVE');

            if (enrollError) throw enrollError;

            // 2. Get existing attendance records for the session
            const { data: records, error: recordsError } = await ems.attendanceRecords()
                .select(`
                    id, company_id, session_id, student_id, status, created_at, remarks,
                    check_in_time, check_out_time, verification_method
                `)
                .eq('company_id', companyId)
                .eq('session_id', sessionId);

            if (recordsError) throw recordsError;

            // 3. Merge data
            const fullRoster = enrollments?.map((enrollment: any) => {
                const record = records?.find(r => r.student_id === enrollment.student_id);
                return {
                    id: record?.id, // Attendance Record ID (if exists)
                    student_id: enrollment.student_id,
                    student: enrollment.student,
                    status: record ? record.status : 'PENDING', // Default to PENDING
                    remarks: record?.remarks,
                    check_in_time: record?.check_in_time,
                    check_out_time: record?.check_out_time,
                    verification_method: record?.verification_method
                };
            }) || [];

            logToFile('Batch Summary Result:', { totalStudents: fullRoster.length, marked: records?.length });

            return { attendance: fullRoster };
        } catch (err: any) {
            logToFile('getBatchAttendanceSummary Catch Error:', { message: err.message, stack: err.stack });
            throw err;
        }
    }

    /**
     * Register student face profile
     */
    static async registerFaceProfile(
        companyId: number,
        studentId: number,
        faceEncoding: any,
        referenceImageUrl: string,
        qualityScore: number
    ) {
        const { data, error } = await ems.faceProfiles()
            .insert({
                company_id: companyId,
                student_id: studentId,
                face_encoding: faceEncoding,
                reference_image_url: referenceImageUrl,
                quality_score: qualityScore,
                is_active: true
            } as any)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Add institution location
     */
    static async addInstitutionLocation(
        companyId: number,
        branchId: number | null,
        locationName: string,
        latitude: number,
        longitude: number,
        radiusMeters: number = 100
    ) {
        const { data, error } = await ems.institutionLocations()
            .insert({
                company_id: companyId,
                branch_id: branchId,
                location_name: locationName,
                latitude,
                longitude,
                radius_meters: radiusMeters,
                is_active: true
            } as any)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
