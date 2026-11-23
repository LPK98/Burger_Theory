<?php

namespace App\Services\Admin;

use App\Enums\UserRole;
use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Account changes made by an administrator: details, role, suspension.
 *
 * Rules:
 * - the acting administrator must still be an active administrator, re-checked with every
 *   active admin row locked (so two admins demoting each other at the same moment can't
 *   both succeed);
 * - an administrator can't change their own role or suspend themselves.
 * Together these mean the actor always remains, so there is always at least one active
 * administrator. Suspending an account, or taking away admin rights, signs it out everywhere
 * (all tokens revoked).
 */
class UserAdministration
{
    /**
     * @param  array{name?: string, phone?: ?string, role?: string, suspended?: bool, suspension_reason?: ?string}  $data
     */
    public function update(User $actor, User $target, array $data): User
    {
        return DB::transaction(function () use ($actor, $target, $data) {
            // Lock every active admin (in id order) and the target, then decide.
            $activeAdminIds = User::query()
                ->where('role', UserRole::Admin->value)
                ->whereNull('suspended_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->pluck('id')
                ->map(fn ($id) => (int) $id);
            if (! $activeAdminIds->contains($actor->id)) {
                throw new ApiException('This action is restricted to administrators.', 'forbidden', 403);
            }
            $user = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();

            $newRole = isset($data['role']) ? UserRole::from($data['role']) : $user->role;
            $suspend = array_key_exists('suspended', $data) ? (bool) $data['suspended'] : $user->isSuspended();
            $roleChanges = $newRole !== $user->role;
            $suspensionChanges = $suspend !== $user->isSuspended();

            if ($actor->is($user) && ($roleChanges || $suspensionChanges)) {
                throw new ApiException('You can’t change your own role or suspend your own account.', 'cannot_modify_self');
            }

            $user->fill(array_intersect_key($data, array_flip(['name', 'phone'])));
            $user->forceFill(['role' => $newRole]);

            if ($suspensionChanges) {
                $user->forceFill($suspend
                    ? ['suspended_at' => now(), 'suspension_reason' => $data['suspension_reason'] ?? null]
                    : ['suspended_at' => null, 'suspension_reason' => null]);
            } elseif ($suspend && array_key_exists('suspension_reason', $data)) {
                $user->forceFill(['suspension_reason' => $data['suspension_reason']]);
            }

            $user->save();

            if (($suspensionChanges && $suspend) || ($roleChanges && $newRole !== UserRole::Admin)) {
                $user->tokens()->delete();
            }

            return $user;
        });
    }
}
