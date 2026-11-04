package com.lnt.chatmee.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

/** SPEC-015 AC-015-3. Code points are spelled out so the source stays ASCII. */
class EmojiValidatorTest {

    private static String cps(int... codePoints) {
        return new String(codePoints, 0, codePoints.length);
    }

    @Test
    void react_quickBarDefaults_accepted() {
        // thumbs up, red heart (with VS16), tears of joy, open mouth, crying, pouting
        for (String emoji : new String[] {cps(0x1F44D), cps(0x2764, 0xFE0F), cps(0x1F602), cps(0x1F62E),
                cps(0x1F622), cps(0x1F621)}) {
            assertThat(EmojiValidator.isSingleEmoji(emoji)).as(emoji).isTrue();
        }
    }

    @Test
    void react_zwjSequence_accepted() {
        // family man-woman-girl-boy, woman technologist with skin tone, rainbow flag
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467, 0x200D, 0x1F466)))
                .isTrue();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F469, 0x1F3FD, 0x200D, 0x1F4BB))).isTrue();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F3F3, 0xFE0F, 0x200D, 0x1F308))).isTrue();
    }

    @Test
    void react_skinToneFlagsKeycapsAndTags_accepted() {
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F44D, 0x1F3FB))).isTrue();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F1FB, 0x1F1F3))).isTrue();
        assertThat(EmojiValidator.isSingleEmoji(cps('7', 0xFE0F, 0x20E3))).isTrue();
        // England: black flag + tag letters g b e n g + cancel tag
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F)))
                .isTrue();
    }

    @Test
    void react_multipleGraphemes_400() {
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F44D, 0x1F44D))).isFalse();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F602, 0x2764))).isFalse();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F1FB, 0x1F1F3, 0x1F1FA))).isFalse();
        // Trailing or doubled joiners
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F468, 0x200D))).isFalse();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F468, 0x200D, 0x200D, 0x1F469))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "a", "ok", "7", "#", "<b>", "\u0000", "\u200D", "\uFE0F", "\uD83C\uDFFB",
            "\u0041\u030A", "\uD83D"})
    void react_invalidEmoji_400(String value) {
        assertThat(EmojiValidator.isSingleEmoji(value)).isFalse();
    }

    @Test
    void react_textMixedWithEmoji_400() {
        assertThat(EmojiValidator.isSingleEmoji("a" + cps(0x1F44D))).isFalse();
        assertThat(EmojiValidator.isSingleEmoji(cps(0x1F44D) + " ")).isFalse();
        assertThat(EmojiValidator.isSingleEmoji(null)).isFalse();
    }

    @Test
    void react_over32Bytes_400() {
        // Seven ZWJ-joined people: one long sequence, beyond the 32-byte bound.
        int[] seq = {0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467, 0x200D, 0x1F466, 0x200D, 0x1F468, 0x200D, 0x1F469};
        assertThat(EmojiValidator.isSingleEmoji(cps(seq))).isFalse();
    }
}
