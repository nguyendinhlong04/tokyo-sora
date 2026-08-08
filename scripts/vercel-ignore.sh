#!/bin/sh
# Vercel "Ignored Build Step" — quyết định project này có cần dựng lại không.
#
# Quy ước mã thoát của Vercel NGƯỢC với trực giác:
#   0 = BỎ QUA build
#   1 = DỰNG
# Nên `git diff --quiet` dùng được thẳng: không có thay đổi thì nó trả 0.
#
# Gọi từ mỗi apps/*/vercel.json với đúng một tham số là thư mục của app:
#   sh $(git rev-parse --show-toplevel)/scripts/vercel-ignore.sh apps/api
#
# Để ở đây chứ không viết thẳng vào tám file vercel.json vì HAI lý do:
#
#   1. Vercel chặn `ignoreCommand` dài quá 256 ký tự. Logic đầy đủ không lọt.
#   2. JSON không có chú thích. Tám bản sao của một câu lệnh không ai giải thích
#      được là tám chỗ sẽ lệch nhau, và lần trước đã lệch thật.
#
# --------------------------------------------------------------- Mốc so sánh
#
# `$VERCEL_GIT_PREVIOUS_SHA` là commit của lần deploy THÀNH CÔNG gần nhất của
# CHÍNH project này. So với nó thì mọi thay đổi giữa hai lần deploy đều được
# tính, bất kể nằm ở commit nào trong loạt push.
#
# Bản cũ so `HEAD^ HEAD`, tức chỉ soi ĐÚNG MỘT commit. Đẩy một loạt commit mà
# thay đổi của app không nằm ở commit CUỐI thì Vercel lặng lẽ bỏ qua app đó.
# Đã dính đúng lỗi này: API mang endpoint mới nằm ở commit giữa, commit cuối chỉ
# chạm apps/web, thế là API không bao giờ được dựng — còn web thì đã lên và gọi
# vào một endpoint chưa tồn tại.
#
# Hai nhánh lùi, theo thứ tự:
#
#   - Biến rỗng (lần deploy đầu của nhánh, hoặc Vercel không cấp) → lùi về HEAD^.
#     KHÔNG chọn "cứ dựng cho chắc": tám project nhân mỗi lần push sẽ ăn hết trần
#     100 deployment/ngày.
#   - Có SHA nhưng không nằm trong bản clone nông (Vercel clone `--depth=10`) →
#     cũng lùi về HEAD^, vì `git diff` với một commit không có trong kho sẽ lỗi.
#   - Không tra được cả HEAD^ (kho chỉ có một commit) → dựng.
set -e

APP="$1"
if [ -z "$APP" ]; then
  echo "vercel-ignore: thiếu tham số thư mục app" >&2
  exit 1
fi

BASE="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  BASE=$(git rev-parse --verify -q HEAD^) || exit 1
fi

# `:/` buộc đường dẫn tính từ gốc kho, không phụ thuộc thư mục đang đứng —
# Vercel có thể chạy bước này từ thư mục gốc của project chứ không phải gốc kho.
set +e
git diff --quiet "$BASE" HEAD -- \
  ":/$APP" \
  ':/packages' \
  ':/pnpm-lock.yaml' \
  ':/pnpm-workspace.yaml' \
  ':/package.json'
exit $?
