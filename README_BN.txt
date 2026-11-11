INCOME TAX CERTIFICATE MAKER — GITHUB + CLOUDFLARE AUTH SETUP
============================================================

গুরুত্বপূর্ণ:
- GitHub Pages একা shared password / password reset চালাতে পারে না।
- এই প্যাকেজে GitHub Pages (HTML) + Cloudflare Worker (API) + Cloudflare D1 (database) ব্যবহার করা হয়েছে।
- Password বদলালে সবার জন্য বদলাবে এবং পুরোনো সব login session বাতিল হবে।
- সাধারণ ব্যবহারকারীর shared password দিয়ে কেউ password বদলাতে পারবে না; Owner Recovery Key লাগবে।
- Recovery Key হারালে password reset করার সহজ উপায় থাকবে না। এটি password manager / নিরাপদ জায়গায় রাখুন।
- HTTPS ও server-side password hashing ব্যবহার করা হয়েছে। তবুও production-এ Cloudflare rate limiting চালু করুন।

PART A — CLOUDFLARE BACKEND
---------------------------
1. Cloudflare account খুলুন: https://dash.cloudflare.com/
2. Workers & Pages > D1 SQL Database > Create database.
   Database name: income-tax-auth
3. D1 database-এর Console-এ worker/schema.sql ফাইলের SQL চালান।
4. Worker তৈরি করুন:
   Workers & Pages > Create > Worker.
   Worker name: income-tax-certificate-auth
5. worker/worker.js-এর সম্পূর্ণ code Worker editor-এ paste করে Deploy করুন.
6. Worker Settings > Bindings > Add D1 database binding:
   Variable name: DB
   Database: income-tax-auth
7. Worker Settings > Variables and Secrets-এ নিচের ৩টি variable/secret যোগ করুন:
   CORS_ORIGIN = আপনার GitHub Pages origin, যেমন https://YOUR-USERNAME.github.io
   SETUP_SECRET = নিজে তৈরি করা একটি লম্বা random setup secret
   RECOVERY_KEY = আলাদা একটি লম্বা random owner recovery key
   SETUP_SECRET ও RECOVERY_KEY অবশ্যই Secret হিসেবে রাখবেন, Plain text নয়।
8. Worker-এর URL কপি করুন, যেমন:
   https://income-tax-certificate-auth.YOUR-SUBDOMAIN.workers.dev

PART B — INITIAL SHARED PASSWORD SETUP
--------------------------------------
প্রথম shared password একবার তৈরি করতে Windows PowerShell-এ নিচের command চালান।
প্রথমে URL, SETUP_SECRET এবং পছন্দের প্রথম password নিজের তথ্য দিয়ে বদলাবেন:

$body = @{ setupSecret = 'YOUR_SETUP_SECRET'; password = 'YOUR_FIRST_SHARED_PASSWORD' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-WORKER.workers.dev/api/setup' -ContentType 'application/json' -Body $body

Password কমপক্ষে ১০ অক্ষরের হতে হবে। Setup সফল হলে দ্বিতীয়বার /api/setup চলবে না।

PART C — FRONTEND CONFIG + GITHUB
---------------------------------
1. site/index.html খুলুন। উপরের script-এ এই লাইন খুঁজুন:
   const API_BASE = 'https://REPLACE-WITH-YOUR-WORKER.workers.dev';
2. REPLACE... অংশে আপনার Worker URL বসান (শেষে slash দেবেন না)।
3. GitHub-এ নতুন repository তৈরি করুন।
4. site/index.html ফাইলটি repository-র root-এ index.html নামে upload করুন।
   (অর্থাৎ site ফোল্ডারের ভেতরের ফাইলটি root-এ দিন; README ও worker ফাইল ঐচ্ছিকভাবে আলাদা folder-এ রাখতে পারেন।)
5. Repository > Settings > Pages > Deploy from a branch > main > /(root) > Save.
6. GitHub Pages-এর URL নিন। CORS_ORIGIN-এ ঠিক সেই origin দিন, যেমন
   https://YOUR-USERNAME.github.io
   যদি project site হয় https://YOUR-USERNAME.github.io/REPO/ তবুও CORS origin হবে
   https://YOUR-USERNAME.github.io (শেষে /REPO দেবেন না)।
7. CORS_ORIGIN বদলালে Worker redeploy করুন।
8. GitHub Pages link খুলে shared password দিয়ে login পরীক্ষা করুন।

PASSWORD CHANGE / FORGOT
------------------------
- Login করা অবস্থায় Owner: Change / Forgot password খুলুন।
- Change password: নতুন password + Owner Recovery Key দিন।
- Forgot password: লগইন ছাড়াই নতুন password + Owner Recovery Key দিন।
- সফল হলে সবার পুরোনো session বন্ধ হবে। সবাইকে নতুন shared password দিয়ে আবার login করতে হবে।

SECURITY NOTES
--------------
- RECOVERY_KEY কাউকে দেবেন না এবং HTML / GitHub repository-তে রাখবেন না।
- SETUP_SECRET-ও প্রকাশ করবেন না।
- Worker URL public হতে পারে; এটি secret নয়।
- GitHub repository Public হলেও password hash / recovery key এতে রাখা নেই।
- Cloudflare Worker-এ rate limiting (বিশেষত /api/login এবং /api/reset-password) configure করুন।
- Certificate maker-এর sample taxpayer data প্রকাশের আগে অবশ্যই নিজের নিরাপদ/উপযুক্ত ডেটা দিয়ে বদলান। এই প্যাকেজে মূল HTML-এর sample fields অপরিবর্তিত আছে।
