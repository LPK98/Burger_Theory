<?php

namespace Database\Factories;

use App\Models\Address;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Address>
 */
class AddressFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'label' => 'Home',
            'recipient_name' => fake()->name(),
            'phone' => '07'.fake()->numerify('########'),
            'line1' => fake()->buildingNumber().' Galle Road',
            'line2' => null,
            'city' => 'Colombo 03',
            'postal_code' => '00300',
            'delivery_instructions' => null,
            'is_default' => false,
        ];
    }
}
