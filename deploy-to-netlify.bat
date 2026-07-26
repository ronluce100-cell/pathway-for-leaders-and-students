@echo off
set SRC=C:\Users\ronl\Claude\Projects\pathway to freedom tri 1 tool
set REPO=C:\Users\ronl\Documents\GitHub\pathway-for-leaders-and-students

echo === Copying files from Projects to GitHub repo ===
copy "%SRC%\ptf-portal.html"                          "%REPO%\ptf-portal.html"                          /Y
copy "%SRC%\pathway-companion.html"                   "%REPO%\pathway-companion.html"                   /Y
copy "%SRC%\camino-companion.html"                    "%REPO%\camino-companion.html"                    /Y
copy "%SRC%\ptf2-companion.html"                      "%REPO%\ptf2-companion.html"                      /Y
copy "%SRC%\ptf3-companion.html"                      "%REPO%\ptf3-companion.html"                      /Y
copy "%SRC%\ptl-leadership-companion.html"            "%REPO%\ptl-leadership-companion.html"            /Y
copy "%SRC%\ptl5-companion.html"                      "%REPO%\ptl5-companion.html"                      /Y
copy "%SRC%\ptf6-companion.html"                      "%REPO%\ptf6-companion.html"                      /Y
copy "%SRC%\ptf7-companion.html"                      "%REPO%\ptf7-companion.html"                      /Y
copy "%SRC%\shoreline-jesus-follower-companion.html"  "%REPO%\shoreline-jesus-follower-companion.html"  /Y
copy "%SRC%\navigating-media-jungle-companion.html"   "%REPO%\navigating-media-jungle-companion.html"   /Y
copy "%SRC%\shoreline-leader-dashboard.html"          "%REPO%\shoreline-leader-dashboard.html"          /Y
copy "%SRC%\parent-companion.html"                    "%REPO%\parent-companion.html"                    /Y

echo.
echo === Running git commit and push ===
cd /d "%REPO%"
if exist ".git\index.lock" del /F ".git\index.lock"
if exist ".git\HEAD.lock" del /F ".git\HEAD.lock"

git add -f ptf-portal.html
git add -f pathway-companion.html
git add -f camino-companion.html
git add -f ptf2-companion.html
git add -f ptf3-companion.html
git add -f ptl-leadership-companion.html
git add -f ptl5-companion.html
git add -f ptf6-companion.html
git add -f ptf7-companion.html
git add -f shoreline-jesus-follower-companion.html
git add -f navigating-media-jungle-companion.html
git add -f shoreline-leader-dashboard.html
git add -f parent-companion.html
git add -f ptf-leader-hub.html
git add -f netlify.toml
git add -f netlify/functions/parse-screen-time.js
git add -f netlify/functions/stripe-webhook.js
git add -f package.json

git status
git commit -m "Add parent companion app + Stripe webhook"
git push origin main

echo.
echo === Done! Netlify will deploy in ~30 seconds ===
echo Live site: https://pathwaytools.netlify.app
echo.
pause
