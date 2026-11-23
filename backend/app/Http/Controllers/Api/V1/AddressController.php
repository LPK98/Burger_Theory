<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddressRequest;
use App\Http\Resources\AddressResource;
use App\Models\Address;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Saved delivery addresses.
 *
 * @tags Addresses
 */
class AddressController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return AddressResource::collection(
            $request->user()->addresses()->orderByDesc('is_default')->orderByDesc('id')->get()
        );
    }

    public function store(AddressRequest $request): AddressResource
    {
        $user = $request->user();

        $address = DB::transaction(function () use ($request, $user) {
            $makeDefault = $request->boolean('is_default') || ! $user->addresses()->exists();
            if ($makeDefault) {
                $this->clearDefault($user);
            }

            return $user->addresses()->create(['is_default' => $makeDefault] + $request->validated());
        });

        return new AddressResource($address);
    }

    public function show(Address $address): AddressResource
    {
        Gate::authorize('view', $address);

        return new AddressResource($address);
    }

    public function update(AddressRequest $request, Address $address): AddressResource
    {
        Gate::authorize('update', $address);

        DB::transaction(function () use ($request, $address) {
            if ($request->boolean('is_default')) {
                $this->clearDefault($request->user(), $address->id);
            }
            $address->update($request->validated());
        });

        return new AddressResource($address);
    }

    public function destroy(Request $request, Address $address): Response
    {
        Gate::authorize('delete', $address);

        DB::transaction(function () use ($request, $address) {
            $wasDefault = $address->is_default;
            $address->update(['is_default' => false]);
            $address->delete();
            if ($wasDefault) {
                $request->user()->addresses()->latest('id')->first()?->update(['is_default' => true]);
            }
        });

        return response()->noContent();
    }

    private function clearDefault(User $user, ?int $except = null): void
    {
        $user->addresses()->where('is_default', true)->when($except, fn ($q) => $q->whereKeyNot($except))->update(['is_default' => false]);
    }
}
