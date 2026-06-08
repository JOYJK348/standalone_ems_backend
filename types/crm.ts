export interface BaseCRMApplication {
    id?: number | string;
    company_id: number;
    branch_id?: number | null;
    date: string;
    category?: string | null;
    categoryname?: string | null;
    upload_file_url?: string | null;
    remarks?: string | null;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
}

export interface VendorApplication extends BaseCRMApplication {
    vendor_name: string;
    company_name: string;
    company_address: string;
    email: string;
    phone_number: string;
    appointment_status: 'yes' | 'no';
    business_type: 'supplier' | 'distributor' | 'service-provider' | 'manufacturer' | 'others';
}

export interface B2BApplication extends BaseCRMApplication {
    contact_person_name: string;
    organization_name: string;
    organization_address: string;
    business_type: 'technology' | 'manufacturing' | 'retail' | 'services' | 'consulting' | 'others';
    mode_of_business: 'freelancer' | 'partnership' | 'co-worker' | 'consultant' | 'others';
    company_website_email: string;
}

export interface PartnerRegistration extends BaseCRMApplication {
    category: string;
    contact_person_name: string;
    organization_name: string;
    organization_address: string;
    email: string;
    phone_number: string;
}

export interface JobSeekerApplication extends BaseCRMApplication {
    full_name: string;
    gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
    dob: string;
    age: number;
    address: string;
    blood_group: string;
    contact_number: string;
    email: string;
    qualification: '10th' | '12th' | 'diploma' | 'ug' | 'pg' | 'phd';
    department: 'hr' | 'it' | 'marketing' | 'finance' | 'sales' | 'production' | 'others';
    years_of_experience: 'fresher' | '1-2' | '3-5' | '5+';
    preferred_job_type: 'full-time' | 'part-time' | 'hybrid' | 'remote';
    upload_resume_url?: string | null;
}

export interface StudentInternshipApplication extends BaseCRMApplication {
    full_name: string;
    registration_number: string;
    address: string;
    email: string;
    contact_number: string;
    blood_group: string;
    dob: string;
    age: number;
    gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
    college_institution_name: string;
    course_type: 'ug' | 'pg' | 'certification';
    department: 'computer-science' | 'electrical' | 'mechanical' | 'civil' | 'electronics' | 'business' | 'others';
    internship_domain: 'it' | 'non-it' | 'others';
    duration: '3-months' | '6-months';
}

export interface CareerGuidanceApplication extends BaseCRMApplication {
    student_name: string;
    standard_year: '9th' | '10th' | '11th' | '12th' | '1st-year' | '2nd-year' | '3rd-year' | '4th-year' | 'graduate';
    date_of_birth: string;
    age: number;
    gender: 'male' | 'female' | 'other';
    location: string;
    contact_number: string;
    email: string;
    parent_guardian_name: string;
    studies_preference: 'science' | 'commerce' | 'arts' | 'engineering' | 'medical' | 'law' | 'business' | 'others';
    abroad_local: 'local' | 'abroad';
    preferred_country?: string | null;
    city_if_abroad?: string | null;
    preferred_university?: string | null;
    career_interest?: string | null;
    skills_strengths?: string | null;
    academic_performance?: string | null;
    hobbies_extracurricular?: string | null;
    preferred_mode_of_study: 'online' | 'offline' | 'hybrid';
    career_support_duration: '1-year' | '2-years' | '5-years' | '15-years';
    mentorship_required: 'yes' | 'no';
    remarks_notes?: string | null;
}

export interface CourseEnquiryRegistration extends BaseCRMApplication {
    sub_category: string;
    name: string;
    email: string;
    phone_number: string;
    date_of_birth: string;
    age: number;
    address: string;
    course_enquiry: string;
}
