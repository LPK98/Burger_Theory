<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit trail of administrator actions: every successful write under /api/v1/admin and every
 * admin sign-in. Append-only (no updated_at). Passwords, tokens and secrets are never stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_activity_logs', function (Blueprint $table) {
            $table->id();
            // Kept when the account is removed; user accounts are soft-deleted anyway.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // Route name without the api.v1. prefix, e.g. admin.products.update.
            $table->string('action', 100);
            $table->string('method', 10);
            $table->string('path', 255);
            // What was acted on, e.g. product / 12 or order / BT-20261122-0001.
            $table->string('subject_type', 60)->nullable();
            $table->string('subject_id', 64)->nullable();
            $table->unsignedSmallInteger('status_code');
            // The submitted fields with sensitive keys removed.
            $table->jsonb('properties')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
            $table->index(['subject_type', 'subject_id']);
            $table->index(['action', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_activity_logs');
    }
};
