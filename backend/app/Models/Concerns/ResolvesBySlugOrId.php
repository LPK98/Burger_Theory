<?php

namespace App\Models\Concerns;

/**
 * Route binding that accepts either the numeric id or the slug, so the storefront can
 * use readable URLs (/products/theory-classic) while admin tools use ids.
 * Slugs are validated never to be purely numeric.
 */
trait ResolvesBySlugOrId
{
    public function resolveRouteBinding($value, $field = null)
    {
        return $this->resolveRouteBindingQuery($this, $value, $field ?? $this->bindingColumnFor($value))->first();
    }

    public function resolveSoftDeletableRouteBinding($value, $field = null)
    {
        return $this->resolveRouteBindingQuery($this, $value, $field ?? $this->bindingColumnFor($value))->withTrashed()->first();
    }

    private function bindingColumnFor(mixed $value): string
    {
        return ctype_digit((string) $value) ? $this->getKeyName() : 'slug';
    }
}
