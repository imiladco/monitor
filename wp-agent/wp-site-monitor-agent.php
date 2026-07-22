<?php
/**
 * Plugin Name: Site Monitor Agent
 * Description: Reports plugin/theme/core updates, admin users and DB size to the central Site Monitor dashboard (Time Machine).
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) exit;

// Set these in wp-config.php, e.g.:
// define('SITE_MONITOR_API_URL', 'https://monitor.yourdomain.com/api/ingest');
// define('SITE_MONITOR_API_KEY', 'the-per-site-key-from-the-dashboard');

if (!defined('SITE_MONITOR_API_URL') || !defined('SITE_MONITOR_API_KEY')) {
    return;
}

function site_monitor_build_snapshot() {
    global $wpdb;

    if (!function_exists('get_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    $all_plugins = get_plugins();
    $active_plugins = get_option('active_plugins', []);
    $plugins = [];
    foreach ($all_plugins as $file => $data) {
        $plugins[] = [
            'slug' => dirname($file) !== '.' ? dirname($file) : $file,
            'name' => $data['Name'],
            'version' => $data['Version'],
            'active' => in_array($file, $active_plugins, true),
        ];
    }

    $theme = wp_get_theme();
    $users = get_users(['fields' => ['ID', 'user_login']]);
    $users_payload = array_map(function ($u) {
        $userdata = get_userdata($u->ID);
        return [
            'id' => $u->ID,
            'login' => $u->user_login,
            'roles' => $userdata ? $userdata->roles : [],
        ];
    }, $users);

    $db_size_mb = $wpdb->get_var($wpdb->prepare(
        "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2)
         FROM information_schema.TABLES WHERE table_schema = %s",
        DB_NAME
    ));

    return [
        'wpVersion' => get_bloginfo('version'),
        'theme' => ['name' => $theme->get('Name'), 'version' => $theme->get('Version')],
        'plugins' => $plugins,
        'users' => $users_payload,
        'dbSizeMb' => $db_size_mb !== null ? (float) $db_size_mb : null,
        'coreIntegrity' => get_option('site_monitor_core_integrity', null),
    ];
}

function site_monitor_send_snapshot() {
    $body = wp_json_encode(site_monitor_build_snapshot());

    wp_remote_post(SITE_MONITOR_API_URL, [
        'timeout' => 15,
        'blocking' => false,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Api-Key' => SITE_MONITOR_API_KEY,
        ],
        'body' => $body,
    ]);
}

function site_monitor_send_event($type, $title, $severity = 'warning', $detail = null) {
    $body = wp_json_encode(compact('type', 'title', 'severity', 'detail'));

    wp_remote_post(SITE_MONITOR_API_URL . '/event', [
        'timeout' => 10,
        'blocking' => false,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Api-Key' => SITE_MONITOR_API_KEY,
        ],
        'body' => $body,
    ]);
}

/**
 * Compares core file hashes against the official checksums from
 * api.wordpress.org to catch modified/backdoored core files. Skips
 * wp-content since themes/plugins legitimately vary there. Runs once a
 * day (it's IO heavy) and caches the result for the hourly snapshot.
 */
function site_monitor_check_core_integrity() {
    if (defined('SITE_MONITOR_DISABLE_INTEGRITY_CHECK') && SITE_MONITOR_DISABLE_INTEGRITY_CHECK) {
        return;
    }

    global $wp_version;
    $locale = get_locale();
    $url = "https://api.wordpress.org/core/checksums/1.0/?version={$wp_version}&locale={$locale}";
    $response = wp_remote_get($url, ['timeout' => 20]);
    if (is_wp_error($response)) return;

    $data = json_decode(wp_remote_retrieve_body($response), true);
    $checksums = $data['checksums'] ?? null;
    if (!$checksums) return;

    $modified = [];
    foreach ($checksums as $file => $expected_md5) {
        if (strpos($file, 'wp-content/') === 0) continue;
        $path = ABSPATH . $file;
        if (!file_exists($path)) {
            $modified[] = ['file' => $file, 'issue' => 'missing'];
            continue;
        }
        if (md5_file($path) !== $expected_md5) {
            $modified[] = ['file' => $file, 'issue' => 'modified'];
        }
        if (count($modified) >= 50) break; // cap payload size
    }

    update_option('site_monitor_core_integrity', [
        'modifiedFiles' => $modified,
        'checkedAt' => current_time('mysql'),
    ], false);
}

add_action('site_monitor_daily_integrity', 'site_monitor_check_core_integrity');
if (!wp_next_scheduled('site_monitor_daily_integrity')) {
    wp_schedule_event(time(), 'daily', 'site_monitor_daily_integrity');
}

/**
 * Brute-force login detection: counts failed logins in a rolling
 * 15-minute window and alerts once per window if it crosses the
 * threshold, instead of on every single failed attempt.
 */
function site_monitor_track_failed_login($username) {
    $window = 15 * MINUTE_IN_SECONDS;
    $threshold = 8;

    $attempts = get_transient('site_monitor_failed_logins') ?: [];
    $attempts[] = time();
    $attempts = array_filter($attempts, fn($t) => $t > time() - $window);
    set_transient('site_monitor_failed_logins', $attempts, $window);

    if (count($attempts) >= $threshold && !get_transient('site_monitor_bruteforce_alerted')) {
        set_transient('site_monitor_bruteforce_alerted', true, $window);
        site_monitor_send_event(
            'brute_force',
            sprintf('حمله‌ی brute-force به wp-login تشخیص داده شد (%d تلاش ناموفق در ۱۵ دقیقه)', count($attempts)),
            'critical',
            ['attempts' => count($attempts), 'lastUsername' => $username]
        );
    }
}
add_action('wp_login_failed', 'site_monitor_track_failed_login');

// Immediate push right after any core/plugin/theme update.
add_action('upgrader_process_complete', 'site_monitor_send_snapshot', 10, 0);
add_action('switch_theme', 'site_monitor_send_snapshot');
add_action('activated_plugin', 'site_monitor_send_snapshot');
add_action('deactivated_plugin', 'site_monitor_send_snapshot');
add_action('user_register', 'site_monitor_send_snapshot');
add_action('set_user_role', 'site_monitor_send_snapshot');

// Hourly safety-net push (catches DB growth, manual DB edits, etc).
if (!wp_next_scheduled('site_monitor_hourly_snapshot')) {
    wp_schedule_event(time(), 'hourly', 'site_monitor_hourly_snapshot');
}
add_action('site_monitor_hourly_snapshot', 'site_monitor_send_snapshot');
