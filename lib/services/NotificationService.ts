import { app_auth } from '@/lib/supabase';

export interface NotificationParams {
    userId?: number;
    companyId: number;
    branchId?: number;
    product: string;
    module?: string;
    title: string;
    message: string;
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'SYSTEM';
    category?: 'ALERT' | 'ANNOUNCEMENT' | 'REMINDER' | 'INFO';
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    targetType?: 'GLOBAL' | 'COMPANY' | 'BRANCH' | 'USER' | 'ROLE';
    targetRoleLevel?: number;
    senderId?: number;
    actionUrl?: string;
    actionLabel?: string; // Note: app_auth.notifications doesn't have action_label, will put in metadata
    referenceType?: string;
    referenceId?: number;
    metadata?: any;
}

export class NotificationService {
    /**
     * Create a single notification
     */
    static async send(params: NotificationParams) {
        try {
            console.log(`[NotificationService] Sending to User: ${params.userId}, Title: ${params.title}`);
            const data: any = {
                user_id: params.userId,
                company_id: params.companyId,
                branch_id: params.branchId,
                target_type: params.targetType || 'USER',
                target_role_level: params.targetRoleLevel,
                sender_id: params.senderId,
                title: params.title,
                message: params.message,
                type: params.type || 'INFO',
                category: params.category || 'INFO',
                priority: params.priority || 'NORMAL',
                action_url: params.actionUrl,
                metadata: {
                    ...(params.metadata || {}),
                    product: params.product,
                    module: params.module,
                    reference_type: params.referenceType,
                    reference_id: params.referenceId,
                    action_label: params.actionLabel
                },
                created_at: new Date().toISOString()
            };

            const { error } = await app_auth.notifications().insert(data);

            if (error) {
                console.error('❌ [NotificationService] DB Error:', error);
                throw error;
            }
            console.log('✅ [NotificationService] Notification sent successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ [NotificationService] Exception:', error);
            return { success: false, error };
        }
    }

    /**
     * Notify multiple users
     */
    static async notifyMany(userIds: number[], params: Omit<NotificationParams, 'userId'>) {
        try {
            console.log(`[NotificationService] Bulk sending to ${userIds.length} users. Title: ${params.title}`);
            const notifications = userIds.map(uid => ({
                user_id: uid,
                company_id: params.companyId,
                branch_id: params.branchId,
                target_type: params.targetType || 'USER',
                target_role_level: params.targetRoleLevel,
                sender_id: params.senderId,
                title: params.title,
                message: params.message,
                type: params.type || 'INFO',
                category: params.category || 'INFO',
                priority: params.priority || 'NORMAL',
                action_url: params.actionUrl,
                metadata: {
                    ...(params.metadata || {}),
                    product: params.product,
                    module: params.module,
                    reference_type: params.referenceType,
                    reference_id: params.referenceId,
                    action_label: params.actionLabel
                },
                created_at: new Date().toISOString()
            }));

            const { error } = await app_auth.notifications().insert(notifications);
            if (error) {
                console.error('❌ [NotificationService] Bulk DB Error:', error);
                throw error;
            }
            console.log(`✅ [NotificationService] Bulk notifications (${userIds.length}) sent successfully`);
            return { success: true };
        } catch (error) {
            console.error('❌ [NotificationService] Bulk Exception:', error);
            return { success: false, error };
        }
    }

    /**
     * Notify Platform Admins (Level 5)
     */
    static async notifyPlatformAdmins(params: any) {
        try {
            const { data: admins } = await app_auth.userRoles()
                .select('user_id')
                .eq('role_id', 1) // PLATFORM_ADMIN is usually ID 1, but better to check level
                .eq('is_active', true);

            // Safer: fetch by level if possible, but for now we follow AuditService's expected call
            const ids = admins?.map(a => a.user_id) || [];
            if (ids.length > 0) {
                return this.notifyMany(ids, {
                    ...params,
                    targetType: 'ROLE',
                    targetRoleLevel: 5,
                    product: 'SYSTEM'
                });
            }
        } catch (e) {
            console.error('Platform Admin Notify Error:', e);
        }
    }

    /**
     * Notify Company Admins
     */
    static async notifyCompanyAdmins(companyId: number, params: any) {
        try {
            const { data: admins } = await app_auth.userRoles()
                .select('user_id')
                .eq('company_id', companyId)
                .eq('is_active', true);

            const ids = admins?.map(a => a.user_id) || [];
            if (ids.length > 0) {
                return this.notifyMany(ids, {
                    ...params,
                    companyId,
                    targetType: 'COMPANY',
                    product: params.product || 'SYSTEM'
                });
            }
        } catch (e) {
            console.error('Company Admin Notify Error:', e);
        }
    }

    /**
     * Notify Branch Admins
     */
    static async notifyBranchAdmins(companyId: number, branchId: number, params: any) {
        try {
            const { data: admins } = await app_auth.userRoles()
                .select('user_id')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .eq('is_active', true);

            const ids = admins?.map(a => a.user_id) || [];
            if (ids.length > 0) {
                return this.notifyMany(ids, {
                    ...params,
                    companyId,
                    branchId,
                    targetType: 'BRANCH',
                    product: params.product || 'SYSTEM'
                });
            }
        } catch (e) {
            console.error('Branch Admin Notify Error:', e);
        }
    }
}
