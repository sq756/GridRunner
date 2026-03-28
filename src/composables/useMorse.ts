import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export function useMorse(activeTabId: Ref<string | null>, calculateMenuPosition: (e: MouseEvent, h?: number) => void) {
  const morseSequence = ref('');
  const morseText = ref('');
  const showMorseMacro = ref(false);
  const morseTimer = ref<any>(null);
  const isMorsePressed = ref(false);

  const morseMap: Record<string, string> = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9'
  };

  const possibleLetters = computed(() => {
    if (!morseSequence.value) return "";
    const candidates = Object.entries(morseMap)
      .filter(([code]) => code.startsWith(morseSequence.value))
      .slice(0, 5)
      .map(([code, char]) => `${char}(${code})`);
    return candidates.length ? "Next: " + candidates.join(" ") : "";
  });

  const commitMorse = async () => {
    const char = morseMap[morseSequence.value];
    if (char && activeTabId.value) {
      morseText.value += char;
      await invoke('write_pty', { tabId: activeTabId.value, data: char });
    }
    morseSequence.value = '';
    setTimeout(() => { if (!morseSequence.value) morseText.value = ''; }, 2000);
  };

  const handleMorseMouse = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'mouseup' || e.type === 'mouseleave') {
      isMorsePressed.value = false;
      return;
    }

    if (e.button === 1) {
      onMorseMacro(e);
      return;
    }
    
    isMorsePressed.value = true;
    if (e.button === 0) morseSequence.value += '.';
    else if (e.button === 2) morseSequence.value += '-';
    
    if (morseTimer.value) clearTimeout(morseTimer.value);
    morseTimer.value = setTimeout(commitMorse, 800);
  };

  const handleMorseWheel = (e: WheelEvent) => {
    if (activeTabId.value) {
      if (e.deltaY < 0) invoke('write_pty', { tabId: activeTabId.value, data: "\r" });
      else invoke('write_pty', { tabId: activeTabId.value, data: "\x7f" });
    }
  };

  const onMorseMacro = (e: MouseEvent) => {
    calculateMenuPosition(e, 200);
    showMorseMacro.value = true;
  };

  return {
    morseSequence,
    morseText,
    showMorseMacro,
    morseTimer,
    isMorsePressed,
    possibleLetters,
    morseMap,
    handleMorseMouse,
    handleMorseWheel,
    onMorseMacro
  };
}
