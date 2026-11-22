# Writing together in Work Desk

Work Desk keeps shared books in **your own free Supabase project**. Supabase is an online database service, so you own your data.
You set it up **once** (about 10 minutes). After that you only send invite codes.

---

## Part 1: Create your online space (once)

1. **Create a Supabase account.** Go to **https://supabase.com** and sign up (free).
2. **Create a project.** Click **New project**:
   - Name: `work-desk`
   - Database password: choose one and keep it somewhere safe (Work Desk doesn't need it)
   - Region: the one closest to you and your co-writers (for Bolivia, a South America region)
   - Click **Create new project** and wait 1–2 minutes.
3. **Install the Work Desk tables.**
   - In the left menu open **SQL Editor** → **New query**.
   - Open the file `supabase/setup.sql` from your Work Desk folder (Notepad works), select all, copy, and paste it into the query box.
   - Click **Run**. You should see *Success*. (Running it again later is safe.)
4. **Make sign-up instant (recommended).**
   Go to **Authentication** → **Sign In / Providers** (on some screens it's **Providers → Email**) and turn **off** "Confirm email".
   If you leave it on, everyone must click a link in a confirmation email before they can sign in.
5. **Copy your two connection values.**
   Go to **Project Settings** → **API** (or **Data API** / **API Keys**) and copy:
   - **Project URL**: looks like `https://abcdefghijk.supabase.co`
   - **anon public** key (a long code starting with `eyJ…`), or the **publishable** key (`sb_publishable_…`) if that's what your project shows.
     ⚠ Never use the `service_role` / *secret* key.

## Part 2: Connect Work Desk and share a book

1. Open Work Desk, open your book, click **👥 Share**.
2. Paste the **Project URL** and the **key**, then click **Connect**.
3. Click **Create account**, enter your name, email and a password.
4. Click **☁ Share this book online**. An online copy is created and opened. Your offline copy stays in your library.
5. Click **👥 Share** again → **Invite someone**, choose what they can do, then click **Create invite code**:
   | Role | Can do |
   |---|---|
   | **Editor** | Write and change everything (text, chapters, notebook, map, timeline, sticky notes) |
   | **Commenter** | Read, add comments & notes, chat |
   | **Reader** | Read and chat |
6. Click **📋 Copy code** and send it to your co-writer (email, WhatsApp…).

## Part 3: How a co-writer joins

1. They need the Work Desk app too. **Send them your whole Work Desk folder as a .zip** (right-click the folder → *Send to → Compressed (zipped) folder*).
   They unzip it and open `index.html` in Edge or Chrome.
2. They click **👥 Join with invite code** (on the Library screen) or **👥 Share** → paste the code → **Join book**.
3. They create their own account. The book opens, and they're in.

The invite code already contains your project address, so co-writers do **not** need to do Part 1.

---

## What you'll see while writing together
- **Avatars** at the top: who's in the book right now. Click one to jump to where that person is.
- **Name tags** in the left margin: which paragraph each person is in.
- **☁ Synced** means everything is saved online. If the internet drops, it says *Offline*, and your changes are sent when you're back (keep the app open).
- **💬 Chat** opens a chat panel next to the page.
- The owner can change roles or remove people at any time under **👥 Share**.

## Good to know
- Work Desk saves **paragraph by paragraph**, so many people can write in the same chapter at once.
  If two people type in the **same paragraph** at the same moment, the last one saved wins. Name tags show where others are, so you can avoid that.
- **Snapshots** and your **writing streak** stay on your own computer.
- Anyone with an invite code can join with that role. Delete codes you no longer need (👥 Share → Active invite codes).
- The anon/publishable key is designed to be shared. Your books are protected by the security rules in `setup.sql`, so only members can read them, and only Owners/Editors can change them.
- Supabase's free plan is plenty for writing groups. Free projects may be **paused after a period of no use**; you can resume yours from the Supabase dashboard.
- To delete a shared book for everyone: Library → **Delete** on the shared book (owner only). Others see **Leave**.
