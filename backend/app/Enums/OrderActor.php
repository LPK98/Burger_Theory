<?php

namespace App\Enums;

enum OrderActor: string
{
    case Customer = 'customer';
    case Admin = 'admin';
    case System = 'system';
}
