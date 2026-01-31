import qrcode

# URL to encode
url = "http://192.168.0.168:8080"

# Generate QR code
qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,
    border=4,
)
qr.add_data(url)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save("site_qr.png")

print("QR code generated and saved as site_qr.png")
