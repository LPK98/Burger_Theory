<?php

namespace App\Services\Admin;

use App\Models\AdminActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Writes the administrator audit trail (admin_activity_logs). Sensitive fields (passwords,
 * tokens, secrets, card data) are replaced with "[redacted]"; uploads are recorded by name
 * and size only; long strings are truncated.
 */
class ActivityLogger
{
    private const SENSITIVE_KEY = '/pass(word|code)?|token|secret|card|cvv|api[_-]?key/i';

    private const MAX_STRING = 500;

    private const MAX_DEPTH = 3;

    /** Records a successful write request made through the admin API. */
    public function recordRequest(Request $request, Response $response): void
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return;
        }

        [$subjectType, $subjectId] = $this->subject($request, $response);

        $properties = array_filter([
            'route' => $this->routeParameters($request),
            'input' => $this->sanitize($request->all()),
        ]);

        $this->write($user, $this->action($request), $request, $response->getStatusCode(), $subjectType, $subjectId, $properties);
    }

    /**
     * Records an event that isn't an admin write request (e.g. an admin signing in).
     *
     * @param  array<string, mixed>  $properties
     */
    public function recordEvent(User $user, string $action, Request $request, int $statusCode = 200, array $properties = []): void
    {
        $this->write($user, $action, $request, $statusCode, 'user', (string) $user->id, $this->sanitize($properties));
    }

    /** @param array<string, mixed> $properties */
    private function write(User $user, string $action, Request $request, int $statusCode, ?string $subjectType, ?string $subjectId, array $properties): void
    {
        AdminActivityLog::query()->create([
            'user_id' => $user->id,
            'action' => Str::limit($action, 100, ''),
            'method' => $request->method(),
            'path' => Str::limit('/'.ltrim($request->path(), '/'), 255, ''),
            'subject_type' => $subjectType === null ? null : Str::limit($subjectType, 60, ''),
            'subject_id' => $subjectId === null ? null : Str::limit($subjectId, 64, ''),
            'status_code' => $statusCode,
            'properties' => $properties === [] ? null : $properties,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }

    /** Route name without the "api.v1." prefix, e.g. "admin.products.update". */
    private function action(Request $request): string
    {
        $name = $request->route()?->getName();

        return $name !== null ? Str::after($name, 'api.v1.') : $request->method().' /'.$request->path();
    }

    /**
     * What the request acted on: the first model in the route ("product", "12"), or for a create,
     * the resource named in the route and the id of what was created.
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function subject(Request $request, Response $response): array
    {
        foreach ($request->route()?->parameters() ?? [] as $value) {
            if ($value instanceof Model) {
                return [Str::snake(class_basename($value)), (string) $value->getRouteKey()];
            }
        }

        $segments = explode('.', $this->action($request));
        $type = isset($segments[1]) && $segments[0] === 'admin' ? Str::singular(str_replace('-', '_', $segments[1])) : null;

        $id = null;
        if ($response instanceof JsonResponse) {
            $data = $response->getData(true);
            $id = is_array($data) && isset($data['data']['id']) && is_scalar($data['data']['id']) ? (string) $data['data']['id'] : null;
        }

        return [$type, $id];
    }

    /** @return array<string, string> e.g. ['product' => '12', 'image' => '30'] */
    private function routeParameters(Request $request): array
    {
        $parameters = [];
        foreach ($request->route()?->parameters() ?? [] as $name => $value) {
            $parameters[$name] = $value instanceof Model ? (string) $value->getRouteKey() : Str::limit((string) $value, 64, '');
        }

        return $parameters;
    }

    /**
     * @param  array<array-key, mixed>  $input
     * @return array<array-key, mixed>
     */
    private function sanitize(array $input, int $depth = 0): array
    {
        $clean = [];
        foreach ($input as $key => $value) {
            if (is_string($key) && preg_match(self::SENSITIVE_KEY, $key)) {
                $clean[$key] = '[redacted]';

                continue;
            }

            $clean[$key] = match (true) {
                $value instanceof UploadedFile => ['file' => Str::limit($value->getClientOriginalName(), 100), 'size' => $value->getSize()],
                is_array($value) => $depth >= self::MAX_DEPTH ? '[…]' : $this->sanitize($value, $depth + 1),
                is_string($value) => Str::limit($value, self::MAX_STRING),
                is_scalar($value), $value === null => $value,
                default => '['.get_debug_type($value).']',
            };
        }

        return $clean;
    }
}
