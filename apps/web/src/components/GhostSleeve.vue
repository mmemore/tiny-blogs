<script setup lang="ts">
/**
 * 404 的"绝版封套"：一张没有压纹的彩胶。
 *
 * 固定内容（不依赖任何文章数据），因此可以直接被 404 页与未知 slug 的文章页共用。
 */
import VinylDisc from './VinylDisc.vue';
</script>

<template>
  <div class="pair">
    <div class="sleeve nf-sleeve">
      <div class="oos">绝版</div>
      <div class="sk">CAT. TB—404 · SIDE ? · 未压纹</div>
      <div class="srule" />
      <h3>这首歌还没录进这一面</h3>
      <p class="tagline">SILENT GROOVE · 请翻面，或退带重试。</p>
      <div class="bt">
        <span>— · —</span>
        <span class="sp">0′</span>
      </div>
    </div>

    <div class="disc-slot" role="img" aria-label="未压纹的彩胶">
      <VinylDisc catalog="TB—404" side="SIDE ?" accent="v3" rpm="—" />
    </div>
  </div>
</template>
