package com.iqoo.textract.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = IqooYellow,
    secondary = CyanAccent,
    background = NavyDark,
    surface = NavyCard,
    onPrimary = NavyDark,
    onSecondary = NavyDark,
    onBackground = WhiteText,
    onSurface = WhiteText
)

@Composable
fun TextractTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
