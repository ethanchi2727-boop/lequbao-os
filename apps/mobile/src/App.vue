<script setup lang="ts">
import './styles/tokens.scss'
</script>

<style lang="scss">
page {
  min-height: 100%;
  background: #070b1b;
  color: var(--ink);
  font-family:
    Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "PingFang SC", "Microsoft YaHei", sans-serif;
}

view,
text,
button,
input {
  box-sizing: border-box;
}

button {
  margin: 0;
  padding: 0;
  line-height: normal;
}

button::after {
  border: 0;
}
</style>
