<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use App\Services\Admin\UserAdministration;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Every account: customers and administrators. Customer spending statistics are under
 * GET /admin/customers.
 *
 * @tags Admin · Users
 */
class UserController extends Controller
{
    /**
     * List accounts.
     *
     * Search matches name, email or phone. `status`: active or suspended. `sort`: newest
     * (default), oldest or name.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'role' => ['nullable', Rule::enum(UserRole::class)],
            'status' => ['nullable', 'in:active,suspended'],
            'sort' => ['nullable', 'in:newest,oldest,name'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = User::query()
            ->withCount('orders')
            ->when($v['search'] ?? null, function (Builder $q, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $s) => $s->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like)->orWhere('phone', 'ilike', $like));
            })
            ->when($v['role'] ?? null, fn (Builder $q, string $role) => $q->where('role', $role))
            ->when($v['status'] ?? null, fn (Builder $q, string $status) => $status === 'suspended' ? $q->whereNotNull('suspended_at') : $q->whereNull('suspended_at'));

        match ($v['sort'] ?? 'newest') {
            'oldest' => $query->orderBy('id'),
            'name' => $query->orderBy('name')->orderBy('id'),
            default => $query->orderByDesc('id'),
        };

        return AdminUserResource::collection($query->paginate((int) ($v['per_page'] ?? 20))->withQueryString());
    }

    /** One account. */
    public function show(User $user): AdminUserResource
    {
        return new AdminUserResource($user->loadCount(['orders', 'addresses']));
    }

    /**
     * Update an account: name, phone, role, suspension.
     *
     * You can't change your own role or suspend yourself (`cannot_modify_self`), so there is
     * always at least one administrator. Suspending an account, or removing admin rights,
     * revokes all of its tokens.
     */
    public function update(UpdateUserRequest $request, User $user, UserAdministration $users): AdminUserResource
    {
        $user = $users->update($request->user(), $user, $request->validated());

        return new AdminUserResource($user->loadCount(['orders', 'addresses']));
    }
}
