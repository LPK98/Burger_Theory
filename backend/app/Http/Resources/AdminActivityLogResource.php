<?php

namespace App\Http\Resources;

use App\Models\AdminActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AdminActivityLog */
class AdminActivityLogResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'method' => $this->method,
            'path' => $this->path,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'status_code' => $this->status_code,
            /** Submitted fields (sensitive ones redacted) and route parameters. */
            'properties' => $this->properties,
            'ip_address' => $this->ip_address,
            'user_agent' => $this->user_agent,
            'user' => $this->whenLoaded('user', fn () => $this->user ? [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'email' => $this->user->email,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
