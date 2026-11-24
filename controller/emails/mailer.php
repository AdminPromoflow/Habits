<?php
declare(strict_types=1);
final class Mailer
{
    public function ready(): bool
    {
        $transport = config('mail_transport');
        if ($transport === 'file') {
            return PHP_SAPI === 'cli-server' &&
                str_starts_with((string) config('db_name'), 'mi_rutina_test_');
        }
        return $transport === 'mail' &&
            function_exists('mail') &&
            str_starts_with((string) config('app_url'), 'https://');
    }
    public function recovery(string $email, string $token, string $language): bool
    {
        $dict = require PROJECT_ROOT . '/translations/' . $language . '.php';
        $link = rtrim(config('app_url'), '/') . '/#reset=' . $token;
        $body =
            $dict['reset_email_body'] .
            "\n\n" .
            $link .
            "\n\n" .
            $dict['reset_email_ignore'] .
            "\n";
        if (!$this->ready()) {
            return false;
        }
        if (config('mail_transport') === 'file') {
            $dir = PROJECT_ROOT . '/tests/.runtime/mail';
            if (!is_dir($dir)) {
                mkdir($dir, 0700, true);
            }
            $path = $dir . '/' . bin2hex(random_bytes(16)) . '.json';
            $written = file_put_contents(
                $path,
                json_encode(
                    ['to' => $email, 'subject' => $dict['reset_email_subject'], 'body' => $body],
                    JSON_THROW_ON_ERROR,
                ),
                LOCK_EX,
            );
            if ($written !== false) {
                chmod($path, 0600);
            }
            return $written !== false;
        }
        $domain = parse_url((string) config('app_url'), PHP_URL_HOST);
        if (!is_string($domain) || !preg_match('/^[a-z0-9.-]+$/iD', $domain)) {
            return false;
        }
        $headers = [
            'MIME-Version' => '1.0',
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding' => '8bit',
            'Date' => gmdate('D, d M Y H:i:s') . ' +0000',
            'Message-ID' => '<' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
        ];
        $from = (string) config('mail_from');
        if ($from === '') {
            $from = 'no-reply@' . $domain;
        }
        if (!filter_var($from, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $from)) {
            return false;
        }
        $headers['From'] = 'MI RUTINA <' . $from . '>';
        return mail(
            $email,
            '=?UTF-8?B?' . base64_encode($dict['reset_email_subject']) . '?=',
            $body,
            $headers,
        );
    }
}
