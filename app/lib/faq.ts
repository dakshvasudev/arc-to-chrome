// Shown on the page and emitted as FAQPage structured data at build time, so the two match.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Arc browser is shutting down. How do I move to Chrome?",
    a: "Arc stops working on 22 December 2026. Before then, copy the command on this page, run it in Terminal on your Mac and press ⌘V here (or drop Arc's export file). Each Arc space becomes a bookmarks file for the Chrome profile you choose, with folders, Favorites, tab names and icons kept. Import each file at chrome://settings/importData. Export your passwords from Arc separately, as described above.",
  },
  {
    q: "How do I export my bookmarks from Arc to Chrome?",
    a: "On a Mac, copy the one-line command on this page, run it in Terminal and press ⌘V here. Your Arc spaces, folders, tab names and icons load instantly. Choose which Chrome profile each space goes to, download the file, then in Chrome open chrome://settings/importData, pick “Bookmarks HTML File” in the dropdown and choose the file.",
  },
  {
    q: "Can Chrome import directly from Arc?",
    a: "No. Chrome's importer understands other browsers like Safari and Firefox, plus bookmark HTML files, but not Arc. This tool turns your Arc data into a bookmarks HTML file that Chrome imports in a few clicks.",
  },
  {
    q: "What happens to my Arc spaces?",
    a: "You decide which Chrome profile each space goes to. Spaces whose names match a Chrome profile are routed automatically, and each profile gets its own file, so work and personal stay separate.",
  },
  {
    q: "Are my Favorites, pinned tabs and folders kept?",
    a: "Yes. Favorites stay a folder, pinned tabs and nested folders keep their structure, and bookmarks keep the names you gave tabs in Arc along with each site's icon.",
  },
  {
    q: "Is it safe? Is my data uploaded anywhere?",
    a: "Nothing is uploaded. The page runs entirely in your browser, and the copy command only reads Arc's and Chrome's files and puts the result on your clipboard. It's open source, so you can read exactly what it does. The page only counts anonymous visits and downloads (no cookies, none of your data), and sends nothing if your browser has Do Not Track on.",
  },
  {
    q: "What about live folders, passwords and extensions?",
    a: "Live folders such as GitHub pull requests are left out by default because Arc refills them. Passwords: in Arc open arc://password-manager/settings and click Export passwords, then in Chrome open chrome://password-manager/settings and click Import passwords. Delete the CSV afterwards. The command-line version also lists your Arc extensions with Chrome Web Store links.",
  },
  {
    q: "Does it work on Windows?",
    a: "Yes. In Arc open Settings → Advanced → Export data and drop the file it saves onto this page. That file only has links, so bookmarks get names generated from them.",
  },
]
