<?php

namespace Tests\Fakes;

use Stripe\HttpClient\ClientInterface;

/**
 * Stands in for Stripe's API at the HTTP layer, so the real stripe-php SDK builds and parses
 * every request. Implements just the endpoints this app calls, honours Idempotency-Key the
 * way Stripe does, and records every request for assertions. Nothing leaves the machine.
 */
class FakeStripeHttpClient implements ClientInterface
{
    /** @var list<array{method: string, path: string, params: array<string, mixed>, headers: array<string, string>}> */
    public array $requests = [];

    /** @var array<string, array<string, mixed>> session id => session */
    public array $sessions = [];

    /** @var array<string, string> idempotency key => session id */
    private array $idempotent = [];

    /** @var list<array{0: int, 1: array<string, mixed>}> responses to return instead of the next calls */
    private array $failures = [];

    private int $counter = 0;

    public function failNext(int $status = 500, string $message = 'Something went wrong on Stripe\'s end.', string $type = 'api_error'): void
    {
        $this->failures[] = [$status, ['error' => ['type' => $type, 'message' => $message]]];
    }

    /** What Stripe does once the shopper pays on the hosted page. */
    public function completeSession(string $id, string $paymentStatus = 'paid'): array
    {
        $this->sessions[$id]['status'] = 'complete';
        $this->sessions[$id]['payment_status'] = $paymentStatus;
        $this->sessions[$id]['payment_intent'] ??= 'pi_test_'.substr(md5($id), 0, 20);

        return $this->sessions[$id];
    }

    public function expireSession(string $id): array
    {
        $this->sessions[$id]['status'] = 'expired';
        $this->sessions[$id]['url'] = null;

        return $this->sessions[$id];
    }

    /** @return list<array{method: string, path: string, params: array<string, mixed>, headers: array<string, string>}> */
    public function requestsTo(string $method, string $pathPattern): array
    {
        return array_values(array_filter($this->requests, fn ($r) => $r['method'] === $method && preg_match($pathPattern, $r['path'])));
    }

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $path = (string) parse_url($absUrl, PHP_URL_PATH);
        parse_str((string) parse_url($absUrl, PHP_URL_QUERY), $query);
        $headerMap = [];
        foreach ($headers as $line) {
            [$name, $value] = array_map('trim', explode(':', $line, 2)) + [1 => ''];
            $headerMap[strtolower($name)] = $value;
        }
        $this->requests[] = ['method' => $method, 'path' => $path, 'params' => $params + $query, 'headers' => $headerMap];

        if ($this->failures !== []) {
            [$status, $body] = array_shift($this->failures);

            return [json_encode($body), $status, ['request-id' => 'req_fake']];
        }

        return match (true) {
            $method === 'post' && $path === '/v1/checkout/sessions' => $this->createSession($params, $headerMap['idempotency-key'] ?? null),
            $method === 'get' && (bool) preg_match('#^/v1/checkout/sessions/([^/]+)$#', $path, $m) => $this->found($this->sessions[$m[1]] ?? null),
            $method === 'post' && (bool) preg_match('#^/v1/checkout/sessions/([^/]+)/expire$#', $path, $m) => $this->expire($m[1]),
            $method === 'get' && (bool) preg_match('#^/v1/payment_intents/([^/]+)$#', $path, $m) => $this->ok($this->paymentIntent($m[1])),
            default => [json_encode(['error' => ['type' => 'invalid_request_error', 'message' => "Unrecognized request URL ({$method}: {$path})."]]), 404, []],
        };
    }

    /** @param array<string, mixed> $params */
    private function createSession(array $params, ?string $idempotencyKey): array
    {
        if ($idempotencyKey !== null && isset($this->idempotent[$idempotencyKey])) {
            return $this->ok($this->sessions[$this->idempotent[$idempotencyKey]]);
        }

        $id = 'cs_test_'.str_pad((string) ++$this->counter, 4, '0', STR_PAD_LEFT).str_repeat('a', 50);
        $amount = 0;
        foreach ($params['line_items'] ?? [] as $line) {
            $amount += (int) $line['price_data']['unit_amount'] * (int) $line['quantity'];
        }

        $session = [
            'id' => $id,
            'object' => 'checkout.session',
            'mode' => $params['mode'] ?? 'payment',
            'status' => 'open',
            'payment_status' => 'unpaid',
            'amount_total' => $amount,
            'currency' => $params['line_items'][0]['price_data']['currency'] ?? 'usd',
            'client_reference_id' => $params['client_reference_id'] ?? null,
            'customer_email' => $params['customer_email'] ?? null,
            'metadata' => $params['metadata'] ?? [],
            'payment_intent' => null,
            'expires_at' => (int) ($params['expires_at'] ?? time() + 86400),
            'success_url' => $params['success_url'] ?? null,
            'cancel_url' => $params['cancel_url'] ?? null,
            'url' => "https://checkout.stripe.com/c/pay/{$id}",
            'livemode' => false,
        ];
        $this->sessions[$id] = $session;
        if ($idempotencyKey !== null) {
            $this->idempotent[$idempotencyKey] = $id;
        }

        return $this->ok($session);
    }

    private function expire(string $id): array
    {
        if (! isset($this->sessions[$id])) {
            return $this->found(null);
        }
        if ($this->sessions[$id]['status'] !== 'open') {
            return [json_encode(['error' => ['type' => 'invalid_request_error', 'message' => 'Only Checkout Sessions with a status of `open` can be expired.']]), 400, []];
        }

        return $this->ok($this->expireSession($id));
    }

    /** @return array<string, mixed> */
    private function paymentIntent(string $id): array
    {
        return [
            'id' => $id,
            'object' => 'payment_intent',
            'status' => 'succeeded',
            'latest_charge' => [
                'id' => 'ch_test_'.substr(md5($id), 0, 20),
                'object' => 'charge',
                'payment_method_details' => [
                    'type' => 'card',
                    'card' => ['brand' => 'visa', 'last4' => '4242', 'exp_month' => 12, 'exp_year' => 2034],
                ],
            ],
        ];
    }

    /** @param array<string, mixed>|null $object */
    private function found(?array $object): array
    {
        return $object === null
            ? [json_encode(['error' => ['type' => 'invalid_request_error', 'code' => 'resource_missing', 'message' => 'No such checkout.session']]), 404, []]
            : $this->ok($object);
    }

    /** @param array<string, mixed> $object */
    private function ok(array $object): array
    {
        return [json_encode($object), 200, ['request-id' => 'req_fake_'.$this->counter]];
    }
}
