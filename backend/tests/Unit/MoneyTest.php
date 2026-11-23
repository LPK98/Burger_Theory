<?php

namespace Tests\Unit;

use App\Support\Money;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class MoneyTest extends TestCase
{
    public static function decimals(): array
    {
        return [
            ['1450.00', 145000],
            ['1450', 145000],
            ['0.05', 5],
            ['0.5', 50],
            ['99999999.99', 9999999999],
            ['-12.30', -1230],
            ['10.500', 1050],
        ];
    }

    #[DataProvider('decimals')]
    public function test_parses_decimal_strings_without_floating_point(string $decimal, int $minor): void
    {
        $this->assertSame($minor, Money::toMinor($decimal));
    }

    public function test_rejects_sub_cent_precision_and_garbage(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Money::toMinor('1.005');
    }

    public function test_rejects_non_numeric(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Money::toMinor('12,50');
    }

    public function test_formats_for_payhere_and_display(): void
    {
        $this->assertSame('1450.00', Money::toDecimal(145000));
        $this->assertSame('0.07', Money::toDecimal(7));
        $this->assertSame('-3.50', Money::toDecimal(-350));
        $this->assertSame('1234567.89', Money::toDecimal(123456789));
        $this->assertSame('LKR 1,234,567.89', Money::format(123456789));
    }

    public function test_percentages_round_half_up_to_the_cent(): void
    {
        $this->assertSame(14500, Money::percentOf(145000, 10));
        $this->assertSame(185, Money::percentOf(1234, 15));   // 185.1 → 185
        $this->assertSame(1, Money::percentOf(5, 10));       // 0.5 → 1
        $this->assertSame(0, Money::percentOf(4, 10));       // 0.4 → 0
    }
}
