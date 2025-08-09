import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="Calculette JS", layout="centered")

# --- Force le fond global clair avec une zone centrale ---
st.markdown(
    """
    <style>
    body {
        background-color: #eaeaea !important;
        color: black !important;
    }
    .main > div {
        display: flex;
        justify-content: center;
    }
    </style>
    """,
    unsafe_allow_html=True
)

st.title("🧮 Calculette interactive ultra-fluide (JS + HTML)")

# --- Composant HTML + JS ---
calculator_html = """
<div style="text-align: center; font-family: Arial; background-color: white; color: black; padding: 10px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); max-width: 320px; margin: auto;">
  <!-- Opération -->
  <div style="margin: 10px auto; border: 2px solid #000; padding: 10px; width: 90%; border-radius: 10px; background-color: white;">
    <h2 style="font-size: 2em; color: black; margin: 0;">35 × 17</h2>
  </div>

  <!-- Proposition -->
  <div id="display" style="font-size: 2em; margin: 10px auto 20px; border: 2px solid #ccc; padding: 10px; width: 90%; background: #f8f8f8; border-radius: 10px; min-height: 1.2em; color: purple;"> </div>

  <!-- Clavier numérique -->
  <div style="display: grid; grid-template-columns: repeat(3, 80px); gap: 10px; justify-content: center;">
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('6')">6</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('0')">0</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('5')">5</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('1')">1</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('4')">4</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('8')">8</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('9')">9</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('3')">3</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('7')">7</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; background: #ffcccc; border-radius: 10px;" onclick="erase()">❌</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; color: purple; border-radius: 10px; background-color: white;" onclick="press('2')">2</button>
    <button style="font-size: 1.5em; font-weight: bold; padding: 15px; background: #ccffcc; border-radius: 10px;" onclick="submit()">✅</button>
  </div>

  <script>
    let input = "";
    function press(num) {
      input += num;
      document.getElementById("display").innerText = input;
    }
    function erase() {
      input = input.slice(0, -1);
      document.getElementById("display").innerText = input;
    }
    function submit() {
      const streamlitInput = window.parent.postMessage({ type: "streamlit:setComponentValue", value: input }, "*");
    }
  </script>
</div>
"""

# --- Zone du composant ---
user_input = components.html(
    calculator_html,
    height=700,
    scrolling=False,
)

# --- Lecture du résultat ---
response = st.experimental_get_query_params().get("value")
if response:
    st.write(f"Tu as répondu : `{response}`")