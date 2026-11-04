interface CouponNotificationItem {
    id: number | string;
}

const getSeenCouponsKey = (userId: number | string) => `eventhub:seen-coupons:${userId}`;

export const countUnseenCoupons = (userId: number | string, coupons: CouponNotificationItem[]): number => {
    const storedIds = localStorage.getItem(getSeenCouponsKey(userId));
    const seenIds = new Set<string>(storedIds ? JSON.parse(storedIds) : []);
    return coupons.filter((coupon) => !seenIds.has(String(coupon.id))).length;
};

export const markCouponsSeen = (userId: number | string, coupons: CouponNotificationItem[]) => {
    localStorage.setItem(getSeenCouponsKey(userId), JSON.stringify(coupons.map((coupon) => String(coupon.id))));
    window.dispatchEvent(new CustomEvent('eventhub:coupons-seen', { detail: { userId: String(userId) } }));
};