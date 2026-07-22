# wp-site-monitor

مانیتور آپ‌تایم، سرعت پاسخ و گواهی SSL برای سایت‌های وردپرسی/ووکامرسی که روی هاست‌های جدا هستن، با هشدار در تلگرام.

## چیکار می‌کنه

- هر چند دقیقه (پیش‌فرض ۵ دقیقه) هر سایت رو GET می‌کنه و آپ‌تایم/سرعت پاسخ رو چک می‌کنه
- اگه `checkoutUrl` تعریف شده باشه، صفحه‌ی چک‌اوت رو هم جدا چک می‌کنه
- گواهی SSL هر دامنه رو چک می‌کنه و قبل از انقضا هشدار می‌ده
- فقط موقع تغییر وضعیت (بالا↔پایین، سریع↔کند) پیام می‌فرسته، نه هر بار — از اسپم جلوگیری می‌کنه
- هر روز یه گزارش خلاصه‌ی وضعیت همه‌ی سایت‌ها به تلگرام می‌فرسته

## راه‌اندازی

```bash
npm install
cp .env.example .env
cp config/sites.example.json config/sites.json
```

### ۱. ساخت ربات تلگرام

- با [@BotFather](https://t.me/BotFather) یه ربات بساز و توکنش رو بگیر
- به ربات پیام بده، بعد به `https://api.telegram.org/bot<TOKEN>/getUpdates` سر بزن تا `chat.id` خودت رو پیدا کنی
- توکن و chat id رو توی `.env` بذار

### ۲. تعریف سایت‌ها

`config/sites.json` رو با URL سایت‌های واقعی‌ت پر کن:

```json
[
  { "name": "Almasara Fast Cart", "url": "https://yoursite.com", "checkoutUrl": "https://yoursite.com/checkout/" }
]
```

### ۳. اجرا

```bash
npm start          # اجرای مداوم با زمان‌بندی
npm run check-once # یک بار چک کن و خارج شو (برای تست)
```

### اجرای دائمی روی VPS با PM2

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## تنظیمات (`.env`)

| متغیر | توضیح |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن ربات تلگرام |
| `TELEGRAM_CHAT_ID` | chat id مقصد هشدارها |
| `CHECK_INTERVAL_MINUTES` | فاصله‌ی چک‌ها به دقیقه (پیش‌فرض ۵) |
| `DAILY_SUMMARY_HOUR` | ساعت ارسال گزارش روزانه (۰ تا ۲۳) |
| `SSL_WARN_DAYS` | چند روز قبل از انقضای SSL هشدار بده |
| `SLOW_RESPONSE_MS` | آستانه‌ی کند بودن پاسخ (میلی‌ثانیه) |
| `REQUEST_TIMEOUT_MS` | تایم‌اوت درخواست |

## ایده‌های بعدی

- چک انقضای دامنه (whois)
- چک وضعیت آپدیت‌های وردپرس/افزونه از طریق WP REST API
- داشبورد وب ساده برای دیدن تاریخچه‌ی وضعیت‌ها
