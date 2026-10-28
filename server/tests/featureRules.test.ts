import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicRegistrationRole } from '../utils/authRules';
import { canReviewEvent } from '../utils/reviewRules';

test('registrasi publik tidak dapat membuat akun admin', () => {
    assert.equal(resolvePublicRegistrationRole('admin'), 'admin');
    assert.equal(resolvePublicRegistrationRole('organizer'), 'organizer');
    assert.equal(resolvePublicRegistrationRole('customer'), 'user');
    assert.equal(resolvePublicRegistrationRole(undefined), 'user');
    assert.equal(resolvePublicRegistrationRole('it'), 'it');
    assert.equal(resolvePublicRegistrationRole('superadmin'), 'invalid');
});

test('ulasan hanya dapat dibuat oleh pemesan yang booking-nya selesai setelah event', () => {
    assert.equal(canReviewEvent([]), false);
    assert.equal(canReviewEvent([{ status: 'waiting_for_payment', hasAttended: true }]), false);
    assert.equal(canReviewEvent([{ status: 'done', hasAttended: false }]), false);
    assert.equal(canReviewEvent([{ status: 'done', hasAttended: true }]), true);
});
