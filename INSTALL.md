# Make Work Desk a real app (install it)

Browsers only install apps from a **web address**, so the steps are:
**back up → put the folder online (free) → open the address → Install**.
Allow about 10 minutes the first time.

---

## Step 1: Back up the books you already have
The online app keeps its own storage, separate from the copy you open from your Downloads folder.
1. Open your current Work Desk (`index.html`) → click the logo to go to the **Library** → **💾 Back up**.
2. A file named `Work Desk backup <date>.json` downloads. Keep it.

(Books you already shared online don't need this: they come back when you sign in.)

## Step 2: Put Work Desk online with Netlify (free)
1. Go to **https://www.netlify.com** and sign up for a free account. Sign up **first**: sites dropped without an account are deleted after about an hour.
2. Open **https://app.netlify.com/drop**.
3. Drag your whole **Work Desk folder** (the one that contains `index.html`) onto the page.
4. After a few seconds you get an address like `https://glistening-pony-12ab34.netlify.app`. It's live.
5. Optional: give it a nicer name. Go to **Project configuration → Change project name**, for example `work-desk-ana`,
   and your app becomes `https://work-desk-ana.netlify.app`.

**Updating later:** open your project in Netlify → **Deploys** → drag the updated folder onto the deploy area.
The installed app picks up the new version the next time it opens.

## Step 3: Install it
- **Windows (Edge or Chrome):** open your address → click **📲 Install** in Work Desk's top bar (or Edge **⋯ → Apps → Install Work Desk**).
  It gets its own window, a Start-menu entry and your icon. Right-click it in the taskbar → **Pin to taskbar**.
- **Android (Chrome):** open the address → **📲 Install app** in the Library (or **⋮ → Install app**).
- **iPhone / iPad (Safari):** open the address → **Share** button → **Add to Home Screen**.

## Step 4: Bring your books back
In the installed app: **Library → ♻ Restore** → choose your backup file. Your theme and writing history come back too.

---

## Good to know
- **Works offline.** After the first visit, Work Desk opens without internet. Shared books need internet to sync.
- **Your writing is not on Netlify.** Netlify only holds the app's files. Your books stay inside the app on each device,
  and shared books are in your own Supabase project. Anyone who opens your address gets an empty Work Desk of their own.
- **Each device has its own library.** To move books between devices, use **💾 Back up / ♻ Restore**, or share the book online.
- **Back up now and then** (for example weekly), and keep the file in OneDrive / Google Drive.
- **Collaboration gets easier:** when creating an invite you can now **🔗 Copy invite link**. Your co-writer clicks it, Work Desk opens and they join; no zip file needed.
  If you left "Confirm email" turned on in Supabase, set **Authentication → URL Configuration → Site URL** to your new address.
