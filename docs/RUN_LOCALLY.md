# Run It Locally (for Everyone)

**You need:** a computer with **Node.js** (version 18 or newer) and **XAMPP** installed. That's it. No database skills, no PHP setup, no config editing.

If you don't have those, install them first:

- **Node.js** — download from <https://nodejs.org> (pick the LTS / "Recommended for Most Users" button).
- **XAMPP** — download from <https://www.apachefriends.org>. Install it to the default location (`C:\xampp` or `D:\xampp`).

Then come back and follow the 4 steps below.

---

## The 4 Steps

### Step 1 — Get the code

Open a terminal (PowerShell or Command Prompt) and run:

```text
cd D:\Games and Apps\Coding\AdminDashboard
```

If the folder doesn't exist yet, replace that with where you want the project to live. You'll need to clone it first if you don't already have it:

```text
git clone <paste-the-repo-url-here>
cd AdminDashboard
```

### Step 2 — Run the one magic command

In the same terminal, type:

```text
npm run setup
```

Press **Enter**. Wait. It will print a lot of lines — that's normal. It does 3 things for you, in order:

1. Installs the project files Node needs (this can take a minute or two the first time).
2. Creates a clean test database inside XAMPP's MySQL.
3. Creates a superadmin account and prints the username + password at the end.

When it's done, you'll see a block that looks like this:

```text
========== setup OK ==========
Superadmin user: superadmin@test.local
Superadmin pass: SuperTest123!X
================================
```

**Copy the username and password** — you need them in step 4. If you don't see the "setup OK" block, scroll up — there will be a red error message explaining what went wrong (most common: XAMPP MySQL not installed or running).

### Step 3 — Start the two servers

You need **two** terminal windows open side by side. Both stay open while you use the app.

**Terminal A** — start the website (Vite, the React dev server):

```text
npm run dev
```

Leave it running. You'll see it print something like `Local: http://localhost:5173/`.

**Terminal B** — start the backend (PHP):

```text
scripts\start-php-server.bat
```

Leave it running too. It will print `PHP X.Y.Z Development Server (http://127.0.0.1:8000) started`.

### Step 4 — Open the site and log in

1. Open your browser.
2. Go to <http://localhost:5173>.
3. You'll see a login form. Type the username and password from Step 2.
4. Click the login button.

You should land on the dashboard. You're done. 🎉

---

## If Something Goes Wrong

| What you see | What to do |
|---|---|
| `npm` is not recognized | You didn't install Node, or you need to restart your terminal after installing it. Close the terminal, open a new one, try again. |
| `php.exe` is not recognized during `npm run setup` | XAMPP isn't installed in a default location. Either install XAMPP, or tell the script where PHP lives by running `$env:PHP_BIN="C:\path\to\php.exe"` in PowerShell before `npm run setup`. |
| The setup script says MySQL can't connect | Open the **XAMPP Control Panel** and click **Start** next to **MySQL**. Then re-run `npm run setup`. |
| Browser shows "This site can't be reached" on port 5173 | Terminal A isn't running. Run `npm run dev` again. |
| Browser shows a 500 error when you try to log in | Terminal B isn't running. Run `scripts\start-php-server.bat` again. |
| Login says "Nama pengguna atau kata sandi salah" | You typed the username or password wrong. The credentials are the ones the setup script printed in Step 2 — re-run `npm run setup` and copy them carefully. |
| You want to start over with a clean database | Run `npm run db:reset`. This drops and recreates the test database. Re-run `npm run setup` afterwards to get the credentials back. |

---

## When You're Done for the Day

1. Go to each terminal and press **Ctrl + C** to stop the servers.
2. Close the browser tab.
3. That's it. Your work is saved in the database.

To come back tomorrow, just open the two terminals again and re-run **Step 3** (the servers). You don't need to re-run the setup unless you want a fresh database.

---

## Quick Recap (for the impatient)

```text
npm run setup                              # one-time, ~1 minute
```

```text
# in two separate terminals:
npm run dev                                # terminal A
scripts\start-php-server.bat               # terminal B
```

```text
# in your browser:
http://localhost:5173                      # log in with what setup printed
```
