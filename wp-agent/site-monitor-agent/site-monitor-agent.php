<?php
/**
 * Plugin Name: Site Monitor Agent
 * Description: Reports plugin/theme/core updates, admin users, DB size, and core file integrity to your Site Monitor dashboard (Time Machine). Configure under Settings → Site Monitor Agent.
 * Version: 1.1.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('SITE_MONITOR_OPTION_GROUP', 'site_monitor_settings');

/* -----------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------*/

function site_monitor_api_url() {
    return defined('SITE_MONITOR_API_URL') ? SITE_MONITOR_API_URL : get_option('site_monitor_api_url', '');
}

function site_monitor_api_key() {
    return defined('SITE_MONITOR_API_KEY') ? SITE_MONITOR_API_KEY : get_option('site_monitor_api_key', '');
}

function site_monitor_is_configured() {
    return site_monitor_api_url() && site_monitor_api_key();
}

add_action('admin_menu', function () {
    add_options_page(
        'Site Monitor Agent',
        'Site Monitor Agent',
        'manage_options',
        'site-monitor-agent',
        'site_monitor_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting(SITE_MONITOR_OPTION_GROUP, 'site_monitor_api_url', ['sanitize_callback' => 'esc_url_raw']);
    register_setting(SITE_MONITOR_OPTION_GROUP, 'site_monitor_api_key', ['sanitize_callback' => 'sanitize_text_field']);
});

add_action('admin_post_site_monitor_test_sync', function () {
    if (!current_user_can('manage_options') || !check_admin_referer('site_monitor_test_sync')) {
        wp_die('Unauthorized');
    }

    $result = site_monitor_send_snapshot(true);
    update_option('site_monitor_last_test', [
        'ok' => $result['ok'],
        'message' => $result['message'],
        'at' => current_time('mysql'),
    ]);

    wp_safe_redirect(add_query_arg('page', 'site-monitor-agent', admin_url('options-general.php')));
    exit;
});

function site_monitor_render_settings_page() {
    if (!current_user_can('manage_options')) return;

    $configured_via_constant = defined('SITE_MONITOR_API_URL') && defined('SITE_MONITOR_API_KEY');
    $last_test = get_option('site_monitor_last_test');
    ?>
    <div class="wrap">
        <h1>Site Monitor Agent</h1>
        <p>این سایت رو به داشبورد <strong>Site Monitor</strong> وصل کن تا آپدیت پلاگین/پوسته، یوزر ادمین جدید، رشد دیتابیس، و تغییر فایل‌های core بلافاصله توی تایم‌لاین ثبت بشه.</p>

        <?php if ($configured_via_constant): ?>
            <div class="notice notice-info"><p>API URL و API Key از <code>wp-config.php</code> (ثابت‌ها) خونده می‌شن، نه از این فرم.</p></div>
        <?php else: ?>
            <form method="post" action="options.php">
                <?php settings_fields(SITE_MONITOR_OPTION_GROUP); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="site_monitor_api_url">API URL</label></th>
                        <td>
                            <input type="url" id="site_monitor_api_url" name="site_monitor_api_url"
                                   value="<?php echo esc_attr(get_option('site_monitor_api_url', '')); ?>"
                                   class="regular-text" dir="ltr"
                                   placeholder="https://your-monitor-domain.com/api/ingest" />
                            <p class="description">توی داشبورد به‌صورت <code>&lt;آدرس‌سرور&gt;/api/ingest</code> هست.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="site_monitor_api_key">API Key</label></th>
                        <td>
                            <input type="text" id="site_monitor_api_key" name="site_monitor_api_key"
                                   value="<?php echo esc_attr(get_option('site_monitor_api_key', '')); ?>"
                                   class="regular-text" dir="ltr" />
                            <p class="description">از داشبورد، صفحه‌ی جزئیات همین سایت، کپی کن.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('ذخیره تنظیمات'); ?>
            </form>
        <?php endif; ?>

        <?php if (site_monitor_is_configured()): ?>
            <hr />
            <h2>تست اتصال</h2>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="site_monitor_test_sync" />
                <?php wp_nonce_field('site_monitor_test_sync'); ?>
                <?php submit_button('ارسال همگام‌سازی همین الان', 'secondary'); ?>
            </form>

            <?php if ($last_test): ?>
                <div class="notice <?php echo $last_test['ok'] ? 'notice-success' : 'notice-error'; ?> inline">
                    <p>
                        <strong><?php echo $last_test['ok'] ? '✅ موفق' : '❌ ناموفق'; ?></strong>
                        — <?php echo esc_html($last_test['message']); ?>
                        (<?php echo esc_html($last_test['at']); ?>)
                    </p>
                </div>
            <?php endif; ?>
        <?php else: ?>
            <p><em>بعد از پر کردن و ذخیره‌ی API URL و API Key، دکمه‌ی تست اتصال این‌جا ظاهر می‌شه.</em></p>
        <?php endif; ?>
    </div>
    <?php
}

/* -----------------------------------------------------------------------
 * Snapshot building + sending
 * ---------------------------------------------------------------------*/

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
        'updatesAvailable' => site_monitor_get_available_updates(),
    ];
}

function site_monitor_get_available_updates() {
    $updates = [];

    $plugin_updates = get_site_transient('update_plugins');
    if (!empty($plugin_updates->response)) {
        foreach ($plugin_updates->response as $file => $data) {
            $updates[] = [
                'type' => 'plugin',
                'slug' => $data->slug ?? dirname($file),
                'name' => $data->slug ?? $file,
                'currentVersion' => $plugin_updates->checked[$file] ?? null,
                'newVersion' => $data->new_version ?? null,
            ];
        }
    }

    $theme_updates = get_site_transient('update_themes');
    if (!empty($theme_updates->response)) {
        foreach ($theme_updates->response as $slug => $data) {
            $updates[] = [
                'type' => 'theme',
                'slug' => $slug,
                'name' => $slug,
                'currentVersion' => wp_get_theme($slug)->get('Version'),
                'newVersion' => $data['new_version'] ?? null,
            ];
        }
    }

    $core_updates = get_site_transient('update_core');
    if (!empty($core_updates->updates[0]) && $core_updates->updates[0]->response === 'upgrade') {
        $updates[] = [
            'type' => 'core',
            'slug' => 'core',
            'name' => 'WordPress',
            'currentVersion' => get_bloginfo('version'),
            'newVersion' => $core_updates->updates[0]->current,
        ];
    }

    return $updates;
}

/**
 * @param bool $blocking If true (e.g. the "test sync" button), waits for the
 *   response and returns a result the settings page can show. Background
 *   hook-triggered pushes stay non-blocking so they don't slow down the
 *   request that triggered them (an admin saving a plugin update, etc).
 */
function site_monitor_send_snapshot($blocking = false) {
    if (!site_monitor_is_configured()) {
        return ['ok' => false, 'message' => 'API URL/Key تنظیم نشده'];
    }

    $body = wp_json_encode(site_monitor_build_snapshot());

    $response = wp_remote_post(site_monitor_api_url(), [
        'timeout' => $blocking ? 20 : 15,
        'blocking' => $blocking,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Api-Key' => site_monitor_api_key(),
        ],
        'body' => $body,
    ]);

    if (!$blocking) return ['ok' => true, 'message' => 'در پس‌زمینه ارسال شد'];

    if (is_wp_error($response)) {
        return ['ok' => false, 'message' => $response->get_error_message()];
    }
    $code = wp_remote_retrieve_response_code($response);
    if ($code >= 200 && $code < 300) {
        return ['ok' => true, 'message' => "سرور با کد {$code} پاسخ داد"];
    }
    return ['ok' => false, 'message' => "سرور با کد {$code} پاسخ داد: " . wp_remote_retrieve_body($response)];
}

function site_monitor_send_event($type, $title, $severity = 'warning', $detail = null) {
    if (!site_monitor_is_configured()) return;

    $body = wp_json_encode(compact('type', 'title', 'severity', 'detail'));

    wp_remote_post(site_monitor_api_url() . '/event', [
        'timeout' => 10,
        'blocking' => false,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Api-Key' => site_monitor_api_key(),
        ],
        'body' => $body,
    ]);
}

// Immediate push right after any core/plugin/theme update.
add_action('upgrader_process_complete', function () { site_monitor_send_snapshot(); }, 10, 0);
add_action('switch_theme', function () { site_monitor_send_snapshot(); });
add_action('activated_plugin', function () { site_monitor_send_snapshot(); });
add_action('deactivated_plugin', function () { site_monitor_send_snapshot(); });
add_action('user_register', function () { site_monitor_send_snapshot(); });
add_action('set_user_role', function () { site_monitor_send_snapshot(); });

// Hourly safety-net push (catches DB growth, manual DB edits, etc).
if (!wp_next_scheduled('site_monitor_hourly_snapshot')) {
    wp_schedule_event(time(), 'hourly', 'site_monitor_hourly_snapshot');
}
add_action('site_monitor_hourly_snapshot', function () { site_monitor_send_snapshot(); });

/* -----------------------------------------------------------------------
 * Core file integrity (daily)
 * ---------------------------------------------------------------------*/

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

/* -----------------------------------------------------------------------
 * Brute-force login detection
 * ---------------------------------------------------------------------*/

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

/* -----------------------------------------------------------------------
 * Remote actions (update plugin/theme/core, clear cache)
 *
 * Off by default on the server side (a global toggle in the dashboard) —
 * this just polls for and executes whatever the server hands it, so the
 * real safety gate lives centrally, not here.
 * ---------------------------------------------------------------------*/

add_filter('cron_schedules', function ($schedules) {
    $schedules['site_monitor_five_minutes'] = ['interval' => 300, 'display' => 'Every 5 minutes'];
    return $schedules;
});

if (!wp_next_scheduled('site_monitor_check_commands')) {
    wp_schedule_event(time(), 'site_monitor_five_minutes', 'site_monitor_check_commands');
}
add_action('site_monitor_check_commands', 'site_monitor_run_pending_commands');

function site_monitor_run_pending_commands() {
    if (!site_monitor_is_configured()) return;

    $response = wp_remote_get(site_monitor_api_url() . '/commands', [
        'timeout' => 15,
        'headers' => ['X-Api-Key' => site_monitor_api_key()],
    ]);
    if (is_wp_error($response)) return;

    $data = json_decode(wp_remote_retrieve_body($response), true);
    foreach ($data['commands'] ?? [] as $command) {
        $result = site_monitor_execute_command($command);
        wp_remote_post(site_monitor_api_url() . '/commands/' . $command['id'] . '/result', [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/json', 'X-Api-Key' => site_monitor_api_key()],
            'body' => wp_json_encode($result),
        ]);
    }

    if (!empty($data['commands'])) {
        site_monitor_send_snapshot(); // refresh state right after making a change
    }
}

function site_monitor_execute_command($command) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
    require_once ABSPATH . 'wp-admin/includes/update.php';
    if (!function_exists('get_plugins')) require_once ABSPATH . 'wp-admin/includes/plugin.php';

    $type = $command['type'];
    $params = $command['params'] ?? [];
    $skin = new Automatic_Upgrader_Skin();

    try {
        switch ($type) {
            case 'update_plugin':
                $file = site_monitor_plugin_file_for_slug($params['slug'] ?? '');
                if (!$file) return ['status' => 'failed', 'result' => 'پلاگین با این slug پیدا نشد'];
                $ok = (new Plugin_Upgrader($skin))->upgrade($file);
                return $ok ? ['status' => 'done', 'result' => 'آپدیت شد'] : ['status' => 'failed', 'result' => 'آپدیت ناموفق بود'];

            case 'update_theme':
                $ok = (new Theme_Upgrader($skin))->upgrade($params['slug'] ?? '');
                return $ok ? ['status' => 'done', 'result' => 'آپدیت شد'] : ['status' => 'failed', 'result' => 'آپدیت ناموفق بود'];

            case 'update_core':
                $updates = get_core_updates();
                if (empty($updates) || $updates[0]->response !== 'upgrade') {
                    return ['status' => 'failed', 'result' => 'آپدیتی برای هسته موجود نیست'];
                }
                $ok = (new Core_Upgrader($skin))->upgrade($updates[0]);
                return is_wp_error($ok)
                    ? ['status' => 'failed', 'result' => $ok->get_error_message()]
                    : ['status' => 'done', 'result' => 'هسته آپدیت شد'];

            case 'clear_cache':
                return ['status' => 'done', 'result' => site_monitor_clear_cache()];

            default:
                return ['status' => 'failed', 'result' => 'نوع دستور ناشناخته'];
        }
    } catch (Throwable $e) {
        return ['status' => 'failed', 'result' => $e->getMessage()];
    }
}

function site_monitor_plugin_file_for_slug($slug) {
    foreach (array_keys(get_plugins()) as $file) {
        if (dirname($file) === $slug || $file === $slug) return $file;
    }
    return null;
}

// Best-effort: fires whichever well-known cache plugin's clear function is
// present, plus wp_cache_flush() as a baseline. Reports what it fired.
function site_monitor_clear_cache() {
    $fired = [];

    if (function_exists('wp_cache_flush')) {
        wp_cache_flush();
        $fired[] = 'wp_cache_flush';
    }
    if (function_exists('rocket_clean_domain')) {
        rocket_clean_domain();
        $fired[] = 'WP Rocket';
    }
    if (function_exists('w3tc_flush_all')) {
        w3tc_flush_all();
        $fired[] = 'W3 Total Cache';
    }
    if (function_exists('wp_cache_clear_cache')) {
        wp_cache_clear_cache();
        $fired[] = 'WP Super Cache';
    }
    if (has_action('litespeed_purge_all')) {
        do_action('litespeed_purge_all');
        $fired[] = 'LiteSpeed Cache';
    }
    if (function_exists('sg_cachepress_purge_cache')) {
        sg_cachepress_purge_cache();
        $fired[] = 'SiteGround Optimizer';
    }

    return $fired ? implode('، ', $fired) . ' پاک شد' : 'هیچ کش شناخته‌شده‌ای پیدا نشد';
}

/* -----------------------------------------------------------------------
 * Fleet Learning — Update Guard (v2 phase B, agent side)
 *
 * Before an admin updates a plugin, ask the monitor whether this exact
 * upgrade path has been flagged bad on another site in the fleet. If so,
 * show a banner in the Plugins / Updates screens. Read-only — this never
 * blocks the update mechanically, only warns; the admin can still proceed.
 * ---------------------------------------------------------------------*/

function site_monitor_check_update_hold($slug, $from, $to) {
    if (!site_monitor_is_configured()) return null;

    // cached briefly so we don't hammer the monitor on every admin page load
    $cache_key = 'site_monitor_hold_' . md5("$slug|$from|$to");
    $cached = get_transient($cache_key);
    if ($cached !== false) return $cached === 'none' ? null : $cached;

    $url = add_query_arg(
        ['plugin' => $slug, 'from' => $from, 'to' => $to],
        site_monitor_api_url_base() . '/update-check'
    );
    $response = wp_remote_get($url, [
        'timeout' => 8,
        'headers' => ['X-Api-Key' => site_monitor_api_key()],
    ]);
    if (is_wp_error($response)) return null;

    $data = json_decode(wp_remote_retrieve_body($response), true);
    $result = (!empty($data['hold'])) ? $data : null;
    set_transient($cache_key, $result ?: 'none', 10 * MINUTE_IN_SECONDS);
    return $result;
}

// The configured API URL ends in /ingest; the guard endpoint is a sibling.
function site_monitor_api_url_base() {
    return preg_replace('#/ingest$#', '', site_monitor_api_url());
}

add_action('admin_notices', function () {
    if (!current_user_can('update_plugins') || !site_monitor_is_configured()) return;

    if (!function_exists('get_plugin_updates')) {
        require_once ABSPATH . 'wp-admin/includes/update.php';
    }
    $updates = get_plugin_updates();
    if (empty($updates)) return;

    foreach ($updates as $file => $data) {
        $slug = dirname($file) !== '.' ? dirname($file) : $file;
        $from = $data->Version ?? null;
        $to = $data->update->new_version ?? null;
        if (!$from || !$to) continue;

        $hold = site_monitor_check_update_hold($slug, $from, $to);
        if ($hold) {
            printf(
                '<div class="notice notice-warning"><p><strong>Site Monitor:</strong> آپدیت «%s» به نسخه‌ی %s توسط Fleet Learning موقتاً hold شده — %s</p></div>',
                esc_html($data->Name),
                esc_html($to),
                esc_html($hold['reason'] ?? 'روی یک سایت دیگر مشکل ایجاد کرده')
            );
        }
    }
});

/* -----------------------------------------------------------------------
 * Cleanup on deactivation
 * ---------------------------------------------------------------------*/

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('site_monitor_hourly_snapshot');
    wp_clear_scheduled_hook('site_monitor_daily_integrity');
    wp_clear_scheduled_hook('site_monitor_check_commands');
});
