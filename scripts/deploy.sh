#!/bin/sh
# Build web và đẩy thư mục dist lên nhánh gh-pages để GitHub Pages phục vụ
set -e
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "Thiếu .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)"; exit 1; }
npm run build
cd dist
touch .nojekyll
[ -f ../CNAME ] && cp ../CNAME .
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -f "$(git -C .. remote get-url origin)" gh-pages
rm -rf .git
echo "Đã đẩy lên nhánh gh-pages."
