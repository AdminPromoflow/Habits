<?php
declare(strict_types=1);
final class AppError extends RuntimeException
{
    public function __construct(public string $key, public int $status = 422)
    {
        parent::__construct($key);
    }
}
