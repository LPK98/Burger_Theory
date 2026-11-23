<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AddonKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AddonRequest;
use App\Http\Resources\AddonResource;
use App\Models\Addon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * @tags Admin · Add-ons
 */
class AddonController extends Controller
{
    /** All add-ons, including switched-off ones (and deleted ones with `with_trashed=1`). */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'kind' => ['nullable', Rule::enum(AddonKind::class)],
            'is_available' => ['nullable', 'boolean'],
            'with_trashed' => ['nullable', 'boolean'],
        ]);

        $addons = Addon::query()
            ->withCount('products')
            ->when($request->boolean('with_trashed'), fn ($q) => $q->withTrashed())
            ->when($v['search'] ?? null, fn ($q, string $term) => $q->where('name', 'ilike', '%'.addcslashes($term, '%_\\').'%'))
            ->when($v['kind'] ?? null, fn ($q, string $kind) => $q->where('kind', $kind))
            ->when($request->has('is_available'), fn ($q) => $q->where('is_available', $request->boolean('is_available')))
            ->ordered()
            ->get();

        return AddonResource::collection($addons);
    }

    /** Create an add-on (price in cents). Link it to products with PUT /admin/products/{product}/addons. */
    public function store(AddonRequest $request): JsonResponse
    {
        $addon = Addon::query()->create($request->validated());

        return (new AddonResource($addon->loadCount('products')))->response()->setStatusCode(201);
    }

    /** An add-on with the products that offer it. */
    public function show(Addon $addon): AddonResource
    {
        return new AddonResource($addon->load('products')->loadCount('products'));
    }

    /**
     * Update an add-on.
     *
     * A new price applies to carts straight away (they are always priced from the database);
     * orders already placed keep the price they were sold at.
     */
    public function update(AddonRequest $request, Addon $addon): AddonResource
    {
        $addon->update($request->validated());

        return new AddonResource($addon->load('products')->loadCount('products'));
    }

    /**
     * Delete an add-on (soft delete).
     *
     * It disappears from every product. Cart lines that include it are flagged
     * (`addon_unavailable`) and can't be checked out; past orders keep their snapshot.
     */
    public function destroy(Addon $addon): Response
    {
        $addon->delete();

        return response()->noContent();
    }
}
