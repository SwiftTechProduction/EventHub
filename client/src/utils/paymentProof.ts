export type PaymentProofAction = 'start' | 'chunk' | 'complete' | 'cancel' | 'read';

export const getPaymentProofEndpoint = (
    bookingId: number | string,
    action: PaymentProofAction,
    options: { uploadId?: string; index?: number } = {}
): string => {
    const params = new URLSearchParams({
        proofAction: action,
        bookingId: String(bookingId),
    });
    if (options.uploadId) params.set('uploadId', options.uploadId);
    if (options.index !== undefined) params.set('index', String(options.index));
    return `/bookings?${params.toString()}`;
};
