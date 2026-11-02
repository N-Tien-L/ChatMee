package com.lnt.chatmee.util;

import java.nio.charset.StandardCharsets;

/**
 * Accepts exactly one emoji (SPEC-015 AC-015-3): one grapheme cluster of at most 32 UTF-8 bytes built only from
 * emoji symbols, ZWJ, VS16, skin-tone modifiers, regional indicators, keycap components and tag characters.
 *
 * <p>The cluster is checked against the emoji sequence grammar rather than {@code BreakIterator}: on the JDK 17
 * production runtime {@code BreakIterator} splits ZWJ sequences (for example a family emoji) into several
 * clusters, while the grammar accepts them as one and still rejects two emoji side by side.
 */
public final class EmojiValidator {

    public static final int MAX_UTF8_BYTES = 32;

    private static final int ZWJ = 0x200D;
    private static final int VS16 = 0xFE0F;
    private static final int KEYCAP = 0x20E3;
    private static final int BLACK_FLAG = 0x1F3F4;
    private static final int TAG_CANCEL = 0xE007F;

    /** Explicit emoji symbol ranges (JDK 17 has no {@code \p{IsEmoji}}). */
    private static final int[][] SYMBOL_RANGES = {
        {0x00A9, 0x00A9}, {0x00AE, 0x00AE}, {0x203C, 0x203C}, {0x2049, 0x2049}, {0x2122, 0x2122},
        {0x2139, 0x2139}, {0x2194, 0x2199}, {0x21A9, 0x21AA}, {0x231A, 0x231B}, {0x2328, 0x2328},
        {0x23CF, 0x23CF}, {0x23E9, 0x23F3}, {0x23F8, 0x23FA}, {0x24C2, 0x24C2}, {0x25AA, 0x25AB},
        {0x25B6, 0x25B6}, {0x25C0, 0x25C0}, {0x25FB, 0x25FE}, {0x2600, 0x27BF}, {0x2934, 0x2935},
        {0x2B05, 0x2B07}, {0x2B1B, 0x2B1C}, {0x2B50, 0x2B50}, {0x2B55, 0x2B55}, {0x3030, 0x3030},
        {0x303D, 0x303D}, {0x3297, 0x3297}, {0x3299, 0x3299},
        {0x1F000, 0x1F1E5}, {0x1F200, 0x1F3FA}, {0x1F400, 0x1FAFF},
    };

    private EmojiValidator() {
    }

    public static boolean isSingleEmoji(String value) {
        if (value == null || value.isEmpty() || value.getBytes(StandardCharsets.UTF_8).length > MAX_UTF8_BYTES) {
            return false;
        }
        int[] cps = value.codePoints().toArray();
        int end = element(cps, 0);
        while (end > 0 && end < cps.length && cps[end] == ZWJ) {
            end = element(cps, end + 1);
        }
        return end == cps.length;
    }

    /** Parses one emoji element at {@code i}; returns the index after it, or -1 if there is none. */
    private static int element(int[] cps, int i) {
        if (i >= cps.length) {
            return -1;
        }
        int cp = cps[i];
        if (isRegionalIndicator(cp)) {
            // A flag is exactly two regional indicators.
            return i + 1 < cps.length && isRegionalIndicator(cps[i + 1]) ? i + 2 : -1;
        }
        if (isKeycapBase(cp)) {
            int j = i + 1;
            if (j < cps.length && cps[j] == VS16) {
                j++;
            }
            return j < cps.length && cps[j] == KEYCAP ? j + 1 : -1;
        }
        if (cp == BLACK_FLAG && i + 1 < cps.length && isTag(cps[i + 1])) {
            // Subdivision flags: black flag, tag letters, cancel tag.
            int j = i + 1;
            while (j < cps.length && isTag(cps[j]) && cps[j] != TAG_CANCEL) {
                j++;
            }
            return j < cps.length && cps[j] == TAG_CANCEL ? j + 1 : -1;
        }
        if (!isSymbol(cp)) {
            return -1;
        }
        int j = i + 1;
        if (j < cps.length && cps[j] == VS16) {
            j++;
        }
        if (j < cps.length && isSkinTone(cps[j])) {
            j++;
        }
        return j;
    }

    private static boolean isSymbol(int cp) {
        if (isSkinTone(cp)) {
            return false;
        }
        for (int[] range : SYMBOL_RANGES) {
            if (cp >= range[0] && cp <= range[1]) {
                return true;
            }
        }
        return false;
    }

    private static boolean isRegionalIndicator(int cp) {
        return cp >= 0x1F1E6 && cp <= 0x1F1FF;
    }

    private static boolean isSkinTone(int cp) {
        return cp >= 0x1F3FB && cp <= 0x1F3FF;
    }

    private static boolean isKeycapBase(int cp) {
        return (cp >= '0' && cp <= '9') || cp == '#' || cp == '*';
    }

    private static boolean isTag(int cp) {
        return cp >= 0xE0020 && cp <= 0xE007F;
    }
}
