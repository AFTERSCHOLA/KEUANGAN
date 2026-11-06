<?php
declare(strict_types=1);

/**
 * server/lib/mailer.php
 *
 * Zero-dependency native PHP SMTP client and email builder.
 *
 * Features:
 * - RFC 2822 email message formatting (HTML body, MIME headers, custom headers)
 * - Native stream_socket_client SMTP exchange:
 *   EHLO -> STARTTLS (if tls) -> EHLO -> AUTH LOGIN -> MAIL FROM -> RCPT TO -> DATA -> QUIT
 * - Safe fallback logging to error_log and server/data/mail_outbox.log when SMTP
 *   is unconfigured or disabled.
 */

/**
 * Load SMTP configuration if server/config.smtp.php exists.
 *
 * @return array|null Returns config array if file exists and valid, null otherwise.
 */
function smtpConfig(): ?array {
    $path = __DIR__ . '/../config.smtp.php';
    if (!is_file($path) || !is_readable($path)) {
        return null;
    }
    $cfg = require $path;
    return is_array($cfg) ? $cfg : null;
}

/**
 * Build an RFC 2822 compliant email message string.
 *
 * @param string $to Recipient email address
 * @param string $subject Email subject line
 * @param string $htmlBody HTML content of the email
 * @param array $extraHeaders Optional extra headers as key => value pairs
 * @return string RFC 2822 formatted email message
 */
function buildEmailMessage(string $to, string $subject, string $htmlBody, array $extraHeaders = [], ?array $configOverride = null): string {
    // CRLF header injection defense
    $to = str_replace(["\r", "\n"], '', trim($to));
    $subject = str_replace(["\r", "\n"], '', trim($subject));
    $cfg = $configOverride ?? smtpConfig();
    $fromEmail = str_replace(["\r", "\n"], '', trim((string)($cfg['from_email'] ?? 'no-reply@afterschola.com')));
    $fromName = str_replace(["\r", "\n"], '', trim((string)($cfg['from_name'] ?? 'Afterschola Admin')));

    $fromHeader = $fromName !== '' ? "{$fromName} <{$fromEmail}>" : $fromEmail;

    // Encode subject if non-ASCII
    $encodedSubject = preg_match('/[^\x20-\x7E]/', $subject)
        ? mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n")
        : $subject;

    $headers = [];
    $headers['Date'] = date('r');
    $headers['From'] = $fromHeader;
    $headers['To'] = $to;
    $headers['Subject'] = $encodedSubject;
    $headers['MIME-Version'] = '1.0';
    $headers['Content-Type'] = 'text/html; charset=UTF-8';
    $headers['Content-Transfer-Encoding'] = '8bit';

    // Merge extra headers (allowing overrides if explicitly specified)
    foreach ($extraHeaders as $k => $v) {
        $headers[$k] = $v;
    }

    $headerLines = [];
    foreach ($headers as $name => $val) {
        $headerLines[] = "{$name}: {$val}";
    }

    $headerBlock = implode("\r\n", $headerLines);

    // Normalize body line endings to CRLF
    $normalizedBody = str_replace(["\r\n", "\r"], "\n", $htmlBody);
    $normalizedBody = str_replace("\n", "\r\n", $normalizedBody);

    return $headerBlock . "\r\n\r\n" . $normalizedBody;
}

/**
 * Send an email via SMTP or fall back to error_log + mail_outbox.log.
 *
 * @param string $to Recipient email address
 * @param string $subject Email subject
 * @param string $htmlBody HTML message body
 * @param array $extraHeaders Optional extra headers
 * @param array|null $configOverride Optional config array for testing/overrides
 * @return bool True on success, false on delivery failure
 */
function sendEmail(
    string $to,
    string $subject,
    string $htmlBody,
    array $extraHeaders = [],
    ?array $configOverride = null
): bool {
    $cfg = $configOverride ?? smtpConfig();
    $enabled = is_array($cfg) && !empty($cfg['enabled']);

    // Fallback mode when SMTP is unconfigured or disabled
    if (!$enabled) {
        error_log(sprintf("sendEmail fallback: To=%s, Subject=%s", $to, $subject));

        $outboxDir = __DIR__ . '/../data';
        if (!is_dir($outboxDir)) {
            @mkdir($outboxDir, 0777, true);
        }

        $outboxFile = $outboxDir . '/mail_outbox.log';
        $entry = sprintf(
            "[%s] To: %s | Subject: %s\n%s\n\n",
            date('c'),
            $to,
            $subject,
            $htmlBody
        );
        @file_put_contents($outboxFile, $entry, FILE_APPEND);
        return true;
    }

    // SMTP Client Stream Implementation
    $host = (string)($cfg['host'] ?? '127.0.0.1');
    $port = (int)($cfg['port'] ?? 587);
    $secure = strtolower((string)($cfg['secure'] ?? 'tls'));
    $username = (string)($cfg['username'] ?? '');
    $password = (string)($cfg['password'] ?? '');
    $timeout = (float)($cfg['timeout'] ?? 15.0);

    $remoteSocket = ($secure === 'ssl')
        ? "ssl://{$host}:{$port}"
        : "tcp://{$host}:{$port}";

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => $cfg['verify_peer'] ?? true,
            'verify_peer_name' => $cfg['verify_peer_name'] ?? true,
            'allow_self_signed' => $cfg['allow_self_signed'] ?? false,
        ],
    ]);

    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($remoteSocket, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        error_log("sendEmail SMTP connect failed to {$remoteSocket} ({$errno}): {$errstr}");
        return false;
    }

    stream_set_timeout($socket, (int)$timeout);

    $readSmtpResponse = function($sock): array {
        $lines = [];
        $code = 0;
        while (!feof($sock)) {
            $line = fgets($sock, 1024);
            if ($line === false) break;
            $lines[] = $line;
            if (preg_match('/^([0-9]{3})([ -])(.*)$/', $line, $m)) {
                $code = (int)$m[1];
                if ($m[2] === ' ') {
                    break;
                }
            }
        }
        return [$code, implode('', $lines)];
    };

    $sendSmtpCommand = function($sock, string $cmd) use ($readSmtpResponse): array {
        fwrite($sock, $cmd . "\r\n");
        return $readSmtpResponse($sock);
    };

    try {
        // 1. Initial Greeting
        [$code, $resp] = $readSmtpResponse($socket);
        if ($code !== 220) {
            fclose($socket);
            error_log("SMTP greeting failed: {$resp}");
            return false;
        }

        $clientDomain = !empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : (gethostname() ?: 'localhost');

        // 2. EHLO
        [$code, $resp] = $sendSmtpCommand($socket, "EHLO {$clientDomain}");
        if ($code !== 250) {
            // Fallback to HELO
            [$code, $resp] = $sendSmtpCommand($socket, "HELO {$clientDomain}");
            if ($code !== 250) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP EHLO/HELO failed: {$resp}");
                return false;
            }
        }

        // 3. STARTTLS if tls
        if ($secure === 'tls') {
            [$code, $resp] = $sendSmtpCommand($socket, "STARTTLS");
            if ($code !== 220) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP STARTTLS command rejected: {$resp}");
                return false;
            }

            $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
            }
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
            }

            $cryptoOk = stream_socket_enable_crypto($socket, true, $cryptoMethod);
            if (!$cryptoOk) {
                fclose($socket);
                error_log("SMTP stream_socket_enable_crypto failed");
                return false;
            }

            // Post-TLS EHLO (RFC 3207)
            [$code, $resp] = $sendSmtpCommand($socket, "EHLO {$clientDomain}");
            if ($code !== 250) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP post-TLS EHLO failed: {$resp}");
                return false;
            }
        }

        // 4. AUTH LOGIN
        if ($username !== '') {
            [$code, $resp] = $sendSmtpCommand($socket, "AUTH LOGIN");
            if ($code !== 334) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP AUTH LOGIN failed: {$resp}");
                return false;
            }

            [$code, $resp] = $sendSmtpCommand($socket, base64_encode($username));
            if ($code !== 334) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP AUTH username failed: {$resp}");
                return false;
            }

            [$code, $resp] = $sendSmtpCommand($socket, base64_encode($password));
            if ($code !== 235) {
                $sendSmtpCommand($socket, "QUIT");
                fclose($socket);
                error_log("SMTP AUTH password failed: {$resp}");
                return false;
            }
        }

        // 5. MAIL FROM
        $fromEmail = trim((string)($cfg['from_email'] ?? 'no-reply@afterschola.com'));
        [$code, $resp] = $sendSmtpCommand($socket, "MAIL FROM:<{$fromEmail}>");
        if ($code !== 250) {
            $sendSmtpCommand($socket, "QUIT");
            fclose($socket);
            error_log("SMTP MAIL FROM failed: {$resp}");
            return false;
        }

        // 6. RCPT TO
        [$code, $resp] = $sendSmtpCommand($socket, "RCPT TO:<{$to}>");
        if ($code !== 250 && $code !== 251) {
            $sendSmtpCommand($socket, "QUIT");
            fclose($socket);
            error_log("SMTP RCPT TO failed: {$resp}");
            return false;
        }

        // 7. DATA
        [$code, $resp] = $sendSmtpCommand($socket, "DATA");
        if ($code !== 354) {
            $sendSmtpCommand($socket, "QUIT");
            fclose($socket);
            error_log("SMTP DATA rejected: {$resp}");
            return false;
        }

        $message = buildEmailMessage($to, $subject, $htmlBody, $extraHeaders, $cfg);
        // RFC 5321 Section 4.5.2 dot stuffing
        $stuffedMessage = preg_replace('/^\./m', '..', $message);
        fwrite($socket, $stuffedMessage . "\r\n.\r\n");

        [$code, $resp] = $readSmtpResponse($socket);
        if ($code !== 250) {
            $sendSmtpCommand($socket, "QUIT");
            fclose($socket);
            error_log("SMTP DATA transmission failed: {$resp}");
            return false;
        }

        // 8. QUIT
        $sendSmtpCommand($socket, "QUIT");
        fclose($socket);
        return true;
    } catch (Throwable $e) {
        error_log("sendEmail SMTP exception: " . $e->getMessage());
        if (is_resource($socket)) {
            @fclose($socket);
        }
        return false;
    }
}
