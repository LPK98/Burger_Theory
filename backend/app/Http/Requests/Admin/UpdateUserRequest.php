<?php

namespace App\Http\Requests\Admin;

use App\Enums\UserRole;
use App\Support\ValidationPatterns;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** An administrator's change to an account. Email and password stay with the account holder. */
class UpdateUserRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'regex:'.ValidationPatterns::PHONE],
            /** customer or admin. Taking admin rights away signs the account out everywhere. */
            'role' => ['sometimes', Rule::enum(UserRole::class)],
            /** true suspends the account (it is signed out and can't sign in); false reinstates it. */
            'suspended' => ['sometimes', 'boolean'],
            /** Shown to administrators only. */
            'suspension_reason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
