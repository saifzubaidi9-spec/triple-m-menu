import html

COFFEE = [
    dict(name="Espresso", desc="Single origin, pulled tight.", price="$2.00", emoji="☕",
         tint=("#4A2E1B", "#26160C"), badge=None),
    dict(name="Double Espresso", desc="Twice the kick for 8am lectures.", price="$2.60", emoji="⚡",
         tint=("#54331A", "#2B190C"), badge=None),
    dict(name="Cappuccino", desc="Velvet foam, dusted cocoa.", price="$3.20", emoji="🫧",
         tint=("#4E3421", "#281A10"), badge=("bestseller", "Bestseller")),
    dict(name="Latte", desc="Slow-steamed, extra smooth.", price="$3.50", emoji="🥛",
         tint=("#4A3A28", "#251D14"), badge=None),
    dict(name="Flat White", desc="Stronger ratio, silkier micro-foam.", price="$3.40", emoji="🤍",
         tint=("#45362A", "#231B15"), badge=None),
    dict(name="Iced Latte", desc="Cold-shaken over campus ice.", price="$3.80", emoji="🧊",
         tint=("#2C4653", "#16242C"), badge=("new", "New")),
    dict(name="Mocha", desc="Espresso × dark chocolate.", price="$3.90", emoji="🍫",
         tint=("#43261A", "#22120C"), badge=None),
    dict(name="Matcha Latte", desc="Ceremonial grade, oat by default.", price="$4.20", emoji="🍵",
         tint=("#3A4D2C", "#1D2816"), badge=("new", "New")),
]

SNACKS = [
    dict(name="Butter Croissant", desc="Baked 7am, flaky to a fault.", price="$2.40", emoji="🥐",
         tint=("#5A3F1E", "#2E200F"), badge=("bestseller", "Bestseller")),
    dict(name="Pain au Chocolat", desc="Two batons of 60% dark inside.", price="$2.90", emoji="🥐",
         tint=("#40281C", "#20140E"), badge=("new", "New")),
    dict(name="Halloumi Toastie", desc="Grilled halloumi, honey, chili flakes.", price="$4.50", emoji="🥪",
         tint=("#52401C", "#29200E"), badge=("veggie", "Veggie")),
    dict(name="Turkey & Swiss Baguette", desc="On yesterday-proofed sourdough.", price="$5.20", emoji="🥖",
         tint=("#4C3520", "#261B10"), badge=None),
    dict(name="Kettle Chips · Sea Salt", desc="Loud. Sorry, lecture halls.", price="$1.80", emoji="🥔",
         tint=("#4A4020", "#252010"), badge=None),
    dict(name="Choc-Chip Cookie", desc="Still warm if you time it right.", price="$2.20", emoji="🍪",
         tint=("#4A331B", "#261A0E"), badge=("bestseller", "Bestseller")),
    dict(name="Blueberry Muffin", desc="Bursting, slightly over-filled.", price="$2.80", emoji="🧁",
         tint=("#37304F", "#1C1828"), badge=None),
    dict(name="Fruit Cup", desc="Whatever the market had at 6am.", price="$3.00", emoji="🍓",
         tint=("#542832", "#2A141A"), badge=("veggie", "Veggie")),
]


def render_items(items):
    rows = []
    for i, it in enumerate(items):
        badge_html = ""
        if it["badge"]:
            cls, label = it["badge"]
            badge_html = f'<span class="badge badge-{cls}">{html.escape(label)}</span>'
        tint_a, tint_b = it["tint"]
        rows.append(f"""      <article class="item" style="--i:{i}">
        <div class="tile" style="background: linear-gradient(135deg, {tint_a}, {tint_b});">{it["emoji"]}</div>
        <div class="info">
          <div class="info-top">
            <h3>{html.escape(it["name"])}</h3>
            {badge_html}
          </div>
          <p class="desc">{html.escape(it["desc"])}</p>
        </div>
        <div class="price">{it["price"]}</div>
      </article>""")
    return "\n".join(rows)


def main():
    tpl = open("menu.template.html", encoding="utf-8").read()
    fonts_dir = r"C:\Users\alzusai\AppData\Local\Temp\fonts"
    fraunces_b64 = open(fonts_dir + r"\fraunces.b64", encoding="ascii").read().strip()
    sora_b64 = open(fonts_dir + r"\sora.b64", encoding="ascii").read().strip()

    out = tpl.replace("__FRAUNCES_B64__", fraunces_b64)
    out = out.replace("__SORA_B64__", sora_b64)
    out = out.replace("__COFFEE_ITEMS__", render_items(COFFEE))
    out = out.replace("__SNACKS_ITEMS__", render_items(SNACKS))

    with open("menu.html", "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote menu.html:", len(out), "bytes")


if __name__ == "__main__":
    main()
