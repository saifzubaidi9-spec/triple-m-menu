def main():
    fonts_dir = r"C:\Users\alzusai\AppData\Local\Temp\fonts"
    tpl = open("theme.template.css", encoding="utf-8").read()
    fraunces_b64 = open(fonts_dir + r"\fraunces.b64", encoding="ascii").read().strip()
    sora_b64 = open(fonts_dir + r"\sora.b64", encoding="ascii").read().strip()

    out = tpl.replace("__FRAUNCES_B64__", fraunces_b64)
    out = out.replace("__SORA_B64__", sora_b64)

    with open("theme.css", "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote theme.css:", len(out), "bytes")


if __name__ == "__main__":
    main()
