<?php

namespace App\Http\Resources;

use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Review */
class ReviewResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $isAdmin = (bool) $request->user()?->isAdmin();

        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'rating' => $this->rating,
            'title' => $this->title,
            'body' => $this->body,
            // Public reviews show a first name and initial only.
            'author' => $this->whenLoaded('user', fn () => $this->publicName($this->user?->name)),
            'is_verified_purchase' => $this->order_id !== null,
            'is_mine' => $request->user()?->id === $this->user_id,
            'is_published' => $this->when($isAdmin, $this->is_published),
            'user_id' => $this->when($isAdmin, $this->user_id),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    private function publicName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        $first = $parts[0] ?? 'Customer';
        $initial = isset($parts[1]) ? ' '.mb_substr($parts[1], 0, 1).'.' : '';

        return $first.$initial;
    }
}
