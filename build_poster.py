MENU_URL = "https://claude.ai/code/artifact/d7292cba-07ee-4b09-9098-7a53d2005a0b"

def main():
    fonts_dir = r"C:\Users\alzusai\AppData\Local\Temp\fonts"
    tpl = open("poster.template.html", encoding="utf-8").read()
    fraunces_b64 = open(fonts_dir + r"\fraunces.b64", encoding="ascii").read().strip()
    sora_b64 = open(fonts_dir + r"\sora.b64", encoding="ascii").read().strip()
    qr_b64 = open(fonts_dir + r"\qr_brand.b64", encoding="ascii").read().strip()

    out = tpl.replace("__FRAUNCES_B64__", fraunces_b64)
    out = out.replace("__SORA_B64__", sora_b64)
    out = out.replace("__QR_B64__", qr_b64)
    out = out.replace("__MENU_URL__", MENU_URL)

    with open("poster.html", "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote poster.html:", len(out), "bytes")


if __name__ == "__main__":
    main()
