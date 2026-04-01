# GPM YouTube Shorts Auto Upload Tool

Tool tự động đăng video YouTube Shorts qua GPM Login. Upload video và **lên lịch công khai** (Schedule) theo giờ đã set trong file Excel.

## ⚡ Tính năng

- ✅ Upload YouTube Shorts tự động qua GPM Login
- ✅ Lên lịch công khai (Schedule) - video Private → tự động Public vào giờ đã set
- ✅ Quản lý 10 kênh YouTube cùng lúc
- ✅ 2 proxy chạy song song, các profile cùng proxy chạy tuần tự
- ✅ Mỗi kênh 5 video/ngày, cách nhau 2-3 tiếng
- ✅ Đọc thông tin từ file Excel
- ✅ Tự động ghi kết quả (done/error) vào Excel
- ✅ Chụp screenshot khi gặp lỗi
- ✅ Random delay mô phỏng hành vi người thật
- ✅ Chế độ dry-run để test trước

## 📋 Yêu cầu

- **GPM Login** đã cài đặt và đang chạy
- **Node.js** >= 16
- 10 profile GPM Login đã đăng nhập YouTube sẵn
- 2 proxy đã cấu hình trong GPM Login

## 🚀 Cài đặt

```bash
# 1. Vào thư mục project
cd gpm-youtube-uploader

# 2. Cài dependencies
npm install
```

## 📖 Hướng dẫn sử dụng

### Bước 1: Lấy danh sách Profile ID từ GPM Login

```bash
npm run list-profiles
```

Kết quả sẽ hiện bảng:
```
│  #   │  Profile ID                  │  Tên Profile                │
│  1   │  abc123xyz                    │  Kênh Nấu Ăn               │
│  2   │  def456uvw                    │  Kênh Công Nghệ            │
...
```

→ **Copy Profile ID** để điền vào Excel.

### Bước 2: Tạo file Excel mẫu

```bash
npm run generate
```

File `schedule.xlsx` sẽ được tạo với 50 rows (10 kênh × 5 video).

### Bước 3: Chỉnh sửa file Excel

Mở file `schedule.xlsx` và chỉnh sửa:

| Cột | Tên | Bạn cần điền |
|-----|-----|-------------|
| A | STT | Số thứ tự (tự động) |
| B | title | Tiêu đề video Shorts |
| C | description | Mô tả video |
| D | profile | **Profile ID từ GPM Login** (bước 1) |
| E | gio_dang | Giờ lên lịch công khai: `2026-04-01 08:00` |
| F | proxy | Nhóm proxy: `proxy1` hoặc `proxy2` |
| G | folder_video | Đường dẫn folder chứa video: `C:\Videos\kenh1` |

> **📌 Quan trọng về cột `profile`**: 
> Profile ID là mã định danh duy nhất của mỗi profile trong GPM Login. 
> Chạy `npm run list-profiles` để xem ID của từng profile.

### Bước 4: Chuẩn bị video

Mỗi folder video cần chứa ít nhất 5 file video (tương ứng 5 Shorts/ngày):
```
C:\Videos\kenh1\
  ├── video1.mp4
  ├── video2.mp4
  ├── video3.mp4
  ├── video4.mp4
  └── video5.mp4
```

Tool sẽ lấy video theo **thứ tự alphabet** trong folder.

### Bước 5: Chạy upload

```bash
# Chạy thử trước (không upload thật)
npm run dry-run

# Chạy thật
npm start
```

### Mỗi ngày chỉ cần làm:

1. Chuẩn bị folder video mới cho mỗi kênh
2. Mở `schedule.xlsx`:
   - Đổi **cột E** (`gio_dang`) → ngày giờ mới
   - Đổi **cột G** (`folder_video`) → folder video mới (nếu khác)
   - **Xóa cột H** (`result`) → để tool chạy lại
3. Chạy `npm start`

## 🔧 Cấu hình

Chỉnh sửa file `config.js` để thay đổi:

| Cấu hình | Mặc định | Mô tả |
|-----------|----------|-------|
| `GPM_API_BASE` | `http://127.0.0.1:19995` | API GPM Login |
| `ACTION_DELAY_MIN/MAX` | 800-2500ms | Delay giữa thao tác |
| `UPLOAD_TIMEOUT_MS` | 300000 (5 phút) | Timeout upload |
| `MAX_RETRIES` | 2 | Số lần thử lại |

## 📁 Cấu trúc project

```
gpm-youtube-uploader/
├── package.json          # Dependencies
├── config.js             # Cấu hình
├── schedule.xlsx         # File lịch upload
├── src/
│   ├── index.js          # CLI entry point
│   ├── gpm-api.js        # GPM Login API
│   ├── youtube-uploader.js # Upload YouTube Shorts
│   ├── excel-manager.js  # Đọc/ghi Excel
│   ├── scheduler.js      # Điều phối upload
│   ├── logger.js         # Logging
│   └── utils.js          # Utilities
├── logs/                 # Log files hàng ngày
└── errors/               # Screenshot khi lỗi
```

## ⚠️ Lưu ý

1. **GPM Login phải chạy trước** khi dùng tool
2. **Các profile đã login YouTube** sẵn rồi
3. YouTube có thể thay đổi giao diện → cần cập nhật selector trong `youtube-uploader.js`
4. Không nên chạy quá nhiều video cùng lúc để tránh bị phát hiện
5. File log hàng ngày trong thư mục `logs/`
6. Screenshot lỗi trong thư mục `errors/`

## 🛠️ Xử lý lỗi

- **"Không thể kết nối GPM Login"**: Mở GPM Login trước
- **"Profile không tồn tại"**: Kiểm tra Profile ID với `npm run list-profiles`
- **"Không tìm thấy video"**: Kiểm tra folder video và đảm bảo có file .mp4/.mov/.avi/.mkv/.webm
- **Upload thất bại**: Kiểm tra screenshot lỗi trong thư mục `errors/`, có thể do YouTube đổi giao diện
