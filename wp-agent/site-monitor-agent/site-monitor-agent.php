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
    ];
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
 * Cleanup on deactivation
 * ---------------------------------------------------------------------*/

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('site_monitor_hourly_snapshot');
    wp_clear_scheduled_hook('site_monitor_daily_integrity');
});
