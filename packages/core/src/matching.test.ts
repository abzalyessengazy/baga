import { describe, expect, it } from "vitest";
import { bestCandidate, mismatch, storeIndex, storeTokens, titleMemory } from "./matching";

// Real pairs from the 7 Nov 2026 Technodom test requests (Kaspi title, Technodom address, Technodom title).
const same = (kaspi: string, slug: string, title?: string) => expect(mismatch(kaspi, storeTokens(slug, title))).toBeNull();
const differ = (kaspi: string, slug: string, title?: string) => expect(mismatch(kaspi, storeTokens(slug, title))).not.toBeNull();

describe("exact product matching (DECISIONS 2026-11-07)", () => {
  it("accepts the same model, memory and colour", () => {
    same("Монитор 24\" Samsung LS24F330EAIXCI черный", "monitor-24-samsung-ls24f330eaixci-1920x1080-169-va-100gc-hdmidp-black-295610");
    same("Смартфон Samsung Galaxy A26 8 ГБ/256 ГБ белый + подарок", "smartfon-gsm-samsung-galaxy-a26-8-256-6-7-50-white-sm-a266bzwhskz-289291",
      "Смартфон Samsung Galaxy A26 8/256GB White");
    same("Смартфон Apple iPhone 18 Pro Max 12 ГБ/256 ГБ бордовый + подарок", "smartfon-gsm-apple-iphone-18-pro-max-12-256gb-6-9-48-burgundy-302623");
    same("Наушники REDMI Buds 6 Play черный", "naushniki-xiaomi-redmi-buds-6-play-black-284053");
    same("Холодильник BEKO B5RCNO373W белый", "holodilnik-beko-b5rcno373w-296478", "Холодильник Beko B5RCNO373W"); // no colour on the store side
    same("Игровая приставка Nintendo Switch 2 + Mario Kart World", "igrovaya-konsol-nintendo-switch-2-bundled-game-mario-kart-world-300181");
  });
  it("rejects another colour (the Liberty 5 that started it all)", () => {
    differ("Наушники Soundcore Liberty 5 синий", "naushniki-besprovodnye-soundcore-liberty-5-a3957-white-298516");
  });
  it("rejects a bigger or newer variant", () => {
    differ("Смартфон Apple iPhone 17 Pro 256Gb темно-синий + подарок", "smartfon-gsm-apple-iphone-17-pro-max-12-256gb-6-9-48-deep-blue-293878");
    differ("Наушники Razer Blackshark V2 X белый", "igrovaya-garnitura-besprovodnaya-razer-blackshark-v2-pro-white-rz04-04530200-r3m1-275572");
    differ("Пылесос DREAME H13 Pro черный", "vertikalniy-moyuschiy-pylesos-dreame-h13-pro-plus-mix-292096");
    differ("Наушники Logitech G Pro X Lightspeed черный", "igrovaya-garnitura-logitech-g-pro-x-2-lightspeed-wireless-magenta-981-001275-275913");
    differ("Наушники Xiaomi Buds 6 белый", "naushniki-xiaomi-redmi-buds-6-play-white-284054");
  });
  it("rejects other memory, trusting the store's title over its address", () => {
    differ("Смартфон Samsung Galaxy A26 8 ГБ/128 ГБ черный", "smartfon-gsm-samsung-galaxy-a26-8-128-6-7-50-black-sm-a266bzkdskz-289288",
      "Смартфон Samsung Galaxy A26 6/128GB Black");
    differ("Смартфон Apple iPhone 15 256Gb черный + подарок", "smartfon-apple-iphone-15-128gb-black-mtp03-274372");
  });
  it("rejects a title without a model number (a case is not a phone)", () => {
    differ("Apple iPhone прозрачный", "smartfon-apple-iphone-16-128gb-teal-284607");
  });
  it("reads memory from Kaspi titles", () => {
    expect(titleMemory("Смартфон Samsung Galaxy A07S 4 ГБ/64 ГБ черный")).toEqual({ ram: 4, storage: 64 });
    expect(titleMemory("Смартфон Apple iPhone 17 Pro Max 2Tb темно-синий")).toEqual({ ram: null, storage: 2048 });
    expect(titleMemory("Чайник Kitfort КТ-641")).toEqual({ ram: null, storage: null });
  });
  it("finds the closest address offline", () => {
    const idx = storeIndex([
      "naushniki-vstavnye-huawei-freebuds-pro-5-white-55038661-299004",
      "naushniki-vstavnye-huawei-freebuds-pro-5-grey-55038660-299005",
      "naushniki-vstavnye-huawei-freebuds-7i-white-55038457-296504",
    ]);
    expect(bestCandidate("Наушники Huawei FreeBuds Pro 5 темно-серый", idx)).toBe("naushniki-vstavnye-huawei-freebuds-pro-5-grey-55038660-299005");
    expect(bestCandidate("Наушники Huawei FreeBuds Pro 5 белый", idx)).toBe("naushniki-vstavnye-huawei-freebuds-pro-5-white-55038661-299004");
    expect(bestCandidate("Наушники Huawei FreeBuds 6 белый", idx)).toBeNull();
  });
});
