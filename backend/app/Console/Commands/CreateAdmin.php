<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

/**
 * Creates the first administrator (or promotes an existing account). There is deliberately no
 * API endpoint that creates one from nothing; once an administrator exists, they can promote
 * existing accounts with PATCH /api/v1/admin/users/{id}.
 */
#[Signature('app:create-admin {--name=} {--email=} {--password= : Avoid in shared shells; you will be prompted if omitted}')]
#[Description('Create an administrator account, or promote an existing user')]
class CreateAdmin extends Command
{
    public function handle(): int
    {
        $email = mb_strtolower(trim((string) ($this->option('email') ?: text('Email', required: true))));
        $existing = User::query()->where('email', $email)->first();

        if ($existing !== null) {
            $existing->forceFill(['role' => UserRole::Admin])->save();
            $this->info("{$email} is now an administrator.");

            return self::SUCCESS;
        }

        $name = (string) ($this->option('name') ?: text('Name', required: true));
        $plain = (string) ($this->option('password') ?: password('Password (min. 10 characters, letters and numbers)', required: true));

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $plain],
            [
                'name' => ['required', 'string', 'max:120'],
                'email' => ['required', 'email'],
                'password' => ['required', Password::min(10)->letters()->numbers()],
            ],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = new User(['name' => $name, 'email' => $email, 'password' => $plain]);
        $user->forceFill(['role' => UserRole::Admin, 'email_verified_at' => now()])->save();

        $this->info("Administrator {$email} created.");

        return self::SUCCESS;
    }
}
