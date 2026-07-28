def main():
    fonts_dir = r"C:\Users\alzusai\AppData\Local\Temp\fonts"
    tpl = open("theme.template.css", encoding="utf-8").read()
    fraunces_b64 = open(fonts_dir + r"\fraunces.b64", encoding="ascii").read().strip()
    sora_b64 = open(fonts_dir + r"\sora.b64", encoding="ascii").read().strip()
    elmessiri_b64 = open(fonts_dir + r"\elmessiri.b64", encoding="ascii").read().strip()
    tajawal400_b64 = open(fonts_dir + r"\tajawal400.b64", encoding="ascii").read().strip()
    tajawal500_b64 = open(fonts_dir + r"\tajawal500.b64", encoding="ascii").read().strip()
    tajawal700_b64 = open(fonts_dir + r"\tajawal700.b64", encoding="ascii").read().strip()

    out = tpl.replace("__FRAUNCES_B64__", fraunces_b64)
    out = out.replace("__SORA_B64__", sora_b64)
    out = out.replace("__ELMESSIRI_B64__", elmessiri_b64)
    out = out.replace("__TAJAWAL400_B64__", tajawal400_b64)
    out = out.replace("__TAJAWAL500_B64__", tajawal500_b64)
    out = out.replace("__TAJAWAL700_B64__", tajawal700_b64)

    with open("theme.css", "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote theme.css:", len(out), "bytes")


if __name__ == "__main__":
    main()
