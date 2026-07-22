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
