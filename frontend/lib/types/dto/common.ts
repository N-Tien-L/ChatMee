export interface ApiResponse<T> {
    success: boolean
    message?: string
    data: T;
}

export interface PagedResponse<T> {
    content: T[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
}
