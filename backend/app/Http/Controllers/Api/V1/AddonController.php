<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AddonKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\AddonResource;
use App\Models\Addon;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * @tags Menu
 */
class AddonController extends Controller
{
    /**
     * List add-ons and extra toppings.
     *
     * Every add-on that is switched on. Which ones a burger accepts, and how many of each,
     * is in that product's `addons` list (GET /products/{product}).
     *
     * @unauthenticated
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'kind' => ['nullable', Rule::enum(AddonKind::class)],
        ]);

        return AddonResource::collection(
            Addon::query()->available()->when($v['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))->ordered()->get()
        );
    }
}
