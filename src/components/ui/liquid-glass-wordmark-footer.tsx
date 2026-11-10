"use client";
import { useEffect, useId, type RefObject, useState, useRef, type CSSProperties, type ReactNode, useLayoutEffect, Suspense, type FormEvent } from "react";
import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { gsap } from "gsap";
import { ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/**
 * Liquid Glass Wordmark Footer by Troy Lorents / Automate Flows.
 * Supply groups, copy, branding and an optional onSubscribe callback.
 * Glass properties: blur 0..40, opacity .04...95, saturation .5..2,
 * tint hex, edge 0..1, distortion 0..60. motionIntensity and rippleStrength: 0..1.5.
 * Set rippleStrength to 0 to keep the droplet/edges without click ripples.
 * Set motion to false to disable spatial motion. System reduced motion is respected.
 * theme omitted inherits host semantic variables; light/dark are optional presets.
 * refractionImage must be a CORS-readable image; refractionTargetRef aligns its crop.
 * Leave at least 32px surrounding space for elastic edges. Native input is not captured.
 * Dependencies: React, lucide-react, gsap, @gsap/react, three.
 * SVG backdrop displacement is Chromium-only; other engines keep CSS glass.
 * WebGL lettering has an HTML fallback and uses the photo, not a live DOM capture.
 * Links and subscription logic are supplied by the consumer, with no service calls inside.
 */
const footerStyles=".lgwf{--g-ink: var(--color-foreground, CanvasText);--g-muted: color-mix(in srgb, var(--g-ink) 80%, transparent);--g-solid: var(--color-card, Canvas);--g-legibility: transparent;--glass-accent: var(--color-primary, #24775b);color:var(--g-ink);font:inherit;isolation:isolate}.lgwf[data-theme=light]{color-scheme:light;--g-ink:#17261d;--g-muted:#2b3b30;--g-solid:#f2f2e9;--g-legibility:transparent}.lgwf[data-theme=dark]{color-scheme:dark;--g-ink:#f4f6ec;--g-muted:#d8dfd2;--g-solid:#202921;--g-legibility:transparent}.lgwf *,.lgwf *:before,.lgwf *:after{box-sizing:border-box}.lgwf a{color:inherit;text-decoration:none}.lgwf button,.lgwf input{font:inherit;color:inherit}.lgwf button{cursor:pointer}.lgwf button:disabled,.lgwf input:disabled{cursor:wait;opacity:.55}.lgwf svg{width:20px;height:20px;stroke-width:1.65;flex-shrink:0}.lgwf :focus-visible{outline:2px solid var(--glass-accent);outline-offset:5px}.lgwf ::selection{background:var(--glass-accent);color:var(--g-solid)}.lgwf input{caret-color:var(--glass-accent)}.g-material{position:relative;background:linear-gradient(var(--glass-support,transparent),var(--glass-support,transparent)),linear-gradient(145deg,rgb(255 255 255 / .1),transparent 36%,rgb(255 255 255 / .015) 67%,rgb(255 255 255 / .07)),color-mix(in srgb,var(--glass-tint) calc(var(--glass-opacity) * 100%),transparent);-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(var(--glass-saturation));backdrop-filter:blur(var(--glass-blur)) saturate(var(--glass-saturation)) var(--glass-refraction,blur(0px));box-shadow:inset 0 1px 1px rgb(255 255 255 / calc(var(--glass-edge) * .8)),inset 1px 0 2px rgb(255 255 255 / calc(var(--glass-edge) * .25)),inset -1px -1px 2px rgb(255 255 255 / calc(var(--glass-edge) * .55)),inset 0 -5px 8px #0d120f1f,0 12px 22px -16px #110c087a}.g-footer-bottom{position:relative;z-index:1}.g-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.g-footer{position:relative;border-radius:28px}.lgwf[data-theme=light] .g-footer{--g-ink:#142118;--g-muted:#17261d}.g-footer-frame{position:relative;container:glass-footer / inline-size}.g-footer-liquid{overflow:visible}.g-footer-surface{position:absolute;inset:-32px;pointer-events:none;box-shadow:none;border-radius:0}.g-footer-pointer-lens{position:absolute;inset:0 auto auto 0;width:32px;height:32px;border-radius:50%;pointer-events:none;opacity:0;z-index:4;--glass-opacity:.015;--glass-blur:1px;--glass-saturation:1.15;--glass-support:transparent;--glass-edge:.9;--glass-distortion:18;background:radial-gradient(ellipse at 28% 20%,rgb(255 255 255 / .24),transparent 35%),radial-gradient(ellipse at 72% 85%,rgb(255 255 255 / .1),transparent 40%);border:1px solid rgb(255 255 255 / .62);box-shadow:inset 0 1px 1px #ffffffb3,inset 0 -1px 1px #241d132e,0 3px 8px #0000001f}.g-footer-rim{position:absolute;width:calc(100% + 64px)!important;height:calc(100% + 64px)!important;inset:-32px;pointer-events:none;z-index:3}.g-footer-rim>path{fill:none;stroke:rgb(255 255 255 / calc(var(--glass-edge) * .9));stroke-width:1.2px}.g-footer-ripple circle{fill:none;stroke-width:1.4px}.g-footer-ripple-highlight{stroke:#ffffffc7}.g-footer-ripple-shadow{stroke:#18221c47}.g-footer-content{display:grid;grid-template-columns:minmax(230px,.85fr) minmax(0,1.55fr);gap:42px;padding:38px 32px 4px;position:relative;z-index:2;align-items:start}.g-footer-intro{min-width:0}.g-footer-brand{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750}.g-footer-brand-icon{display:grid;place-items:center;width:27px;height:27px}.g-footer-brand-icon img{width:27px;height:27px;object-fit:contain}.g-footer-intro h2{font-size:clamp(21px,2.5vw,29px);font-weight:650;line-height:1.2;letter-spacing:-.035em;max-width:11em;text-wrap:balance;margin:18px 0 10px}.g-footer-intro>p{font-size:12px;line-height:1.6;color:var(--g-muted);margin:0;max-width:25em}.g-footer-form{margin-top:18px;width:100%;max-width:360px}.g-footer-input{display:flex;align-items:center;border-radius:30px;background:color-mix(in srgb,var(--g-solid) 28%,transparent);box-shadow:inset 0 1px 3px #0002,inset 0 -1px 1px #fff7;padding:3px}.g-footer-input input{min-width:0;flex:1;background:none;border:0;padding-left:13px;font-size:11px;height:38px;outline-offset:-2px}.g-footer-input input::placeholder{color:var(--g-muted);opacity:1}.lgwf .g-footer-input button{background:var(--g-ink);color:var(--g-solid);border:0;width:44px;height:34px;display:grid;place-items:center;border-radius:30px}.g-footer-input button:hover{opacity:.8}.g-footer-form>small{font-size:9px;line-height:1.5;display:block;color:var(--g-muted);margin-top:9px}.g-footer-status{min-height:15px;font-size:10px;margin:4px 0 0;color:var(--g-ink)}.g-footer-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding:22px 26px;border-radius:20px;margin-top:4px;--glass-opacity:.14}.g-footer-links h3{font-size:10px;font-weight:750;margin:0 0 12px}.g-footer-links a{font-size:11px;line-height:1.4;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:7px 0;color:var(--g-ink)}.g-footer-links a:hover{text-decoration:underline;text-underline-offset:4px}.g-footer-links a svg{width:10px;height:10px;opacity:0;transition:opacity .2s}.g-footer-links a:hover svg{opacity:1}.g-wordmark-canvas{height:clamp(160px,23vw,320px);width:100%;position:relative;cursor:default;filter:drop-shadow(0 12px 8px #120c062b)}.g-wordmark-canvas canvas{display:block;max-width:100%}.g-wordmark-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:clamp(60px,17vw,240px);font-weight:850;letter-spacing:-.04em;color:color-mix(in srgb,var(--g-ink) 38%,transparent);text-shadow:0 2px 0 #fff9,0 8px 10px #0003}.g-footer-bottom{display:flex;align-items:center;justify-content:space-between;padding:8px 32px 4px;font-size:10px;color:var(--g-ink);gap:15px}.g-footer-bottom>span:last-child{display:flex;gap:9px;align-items:center}.g-footer-dot{width:5px;height:5px;border-radius:50%;background:var(--glass-accent)}@container glass-footer (max-width:680px){.g-footer{border-radius:26px 26px 18px 18px}.g-footer-content{grid-template-columns:1fr;gap:18px;padding:28px 22px 0}.g-footer-intro{width:auto}.g-footer-intro h2{font-size:26px;margin-top:20px}.g-footer-links{gap:12px;padding:18px 14px}.g-footer-links h3{margin-bottom:10px}.g-footer-links a{min-height:34px}.g-wordmark-canvas{height:160px;margin-top:12px}.g-footer-bottom{padding:20px 22px 0;font-size:9px}}@media(prefers-reduced-motion:reduce){.lgwf *,.lgwf *:before,.lgwf *:after{transition-duration:0s!important;animation-duration:0s!important;scroll-behavior:auto!important}}@media(prefers-reduced-transparency:reduce){.lgwf .g-material{background:var(--g-solid);backdrop-filter:none;-webkit-backdrop-filter:none}}@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.lgwf .g-material{background:var(--g-solid)}}.g-footer-bottom>span{background:color-mix(in srgb,var(--g-solid) 24%,transparent);border-radius:20px;padding:5px 9px}.g-footer-status:empty{display:none}.g-footer-form{margin-top:14px}.g-footer-content{padding-top:32px}";

/* Embedded font data license:
Copyright @ 2004 by MAGENTA Ltd. All Rights Reserved.
*/
const typeface={"glyphs":{"0":{"x_min":51,"x_max":779,"ha":828,"o":"m 415 -26 q 142 129 242 -26 q 51 476 51 271 q 141 825 51 683 q 415 984 242 984 q 687 825 585 984 q 779 476 779 682 q 688 131 779 271 q 415 -26 587 -26 m 415 137 q 529 242 485 137 q 568 477 568 338 q 530 713 568 619 q 415 821 488 821 q 303 718 344 821 q 262 477 262 616 q 301 237 262 337 q 415 137 341 137 "},"1":{"x_min":197.609375,"x_max":628,"ha":828,"o":"m 628 0 l 434 0 l 434 674 l 197 674 l 197 810 q 373 837 318 810 q 468 984 450 876 l 628 984 l 628 0 "},"2":{"x_min":64,"x_max":764,"ha":828,"o":"m 764 685 q 675 452 764 541 q 484 325 637 415 q 307 168 357 250 l 754 168 l 754 0 l 64 0 q 193 301 64 175 q 433 480 202 311 q 564 673 564 576 q 519 780 564 737 q 416 824 475 824 q 318 780 358 824 q 262 633 270 730 l 80 633 q 184 903 80 807 q 415 988 276 988 q 654 907 552 988 q 764 685 764 819 "},"3":{"x_min":61,"x_max":767,"ha":828,"o":"m 767 290 q 653 51 767 143 q 402 -32 548 -32 q 168 48 262 -32 q 61 300 61 140 l 250 300 q 298 173 250 219 q 405 132 343 132 q 514 169 471 132 q 563 282 563 211 q 491 405 563 369 q 343 432 439 432 l 343 568 q 472 592 425 568 q 534 701 534 626 q 493 793 534 758 q 398 829 453 829 q 306 789 344 829 q 268 669 268 749 l 80 669 q 182 909 80 823 q 410 986 274 986 q 633 916 540 986 q 735 719 735 840 q 703 608 735 656 q 615 522 672 561 q 727 427 687 486 q 767 290 767 369 "},"4":{"x_min":53,"x_max":775.21875,"ha":828,"o":"m 775 213 l 660 213 l 660 0 l 470 0 l 470 213 l 53 213 l 53 384 l 416 958 l 660 958 l 660 370 l 775 370 l 775 213 m 474 364 l 474 786 l 204 363 l 474 364 "},"5":{"x_min":59,"x_max":767,"ha":828,"o":"m 767 319 q 644 59 767 158 q 382 -29 533 -29 q 158 43 247 -29 q 59 264 59 123 l 252 264 q 295 165 252 201 q 400 129 339 129 q 512 172 466 129 q 564 308 564 220 q 514 437 564 387 q 398 488 464 488 q 329 472 361 488 q 271 420 297 456 l 93 428 l 157 958 l 722 958 l 722 790 l 295 790 l 271 593 q 348 635 306 621 q 431 649 389 649 q 663 551 560 649 q 767 319 767 453 "},"6":{"x_min":57,"x_max":771,"ha":828,"o":"m 744 734 l 544 734 q 500 802 533 776 q 425 828 466 828 q 315 769 359 828 q 264 571 264 701 q 451 638 343 638 q 691 537 602 638 q 771 315 771 449 q 683 79 771 176 q 420 -29 586 -29 q 134 123 227 -29 q 57 455 57 250 q 184 865 57 721 q 452 988 293 988 q 657 916 570 988 q 744 734 744 845 m 426 128 q 538 178 498 128 q 578 300 578 229 q 538 422 578 372 q 415 479 493 479 q 303 430 342 479 q 264 313 264 381 q 308 184 264 240 q 426 128 352 128 "},"7":{"x_min":65.28125,"x_max":762.5,"ha":828,"o":"m 762 808 q 521 435 604 626 q 409 0 438 244 l 205 0 q 313 422 227 234 q 548 789 387 583 l 65 789 l 65 958 l 762 958 l 762 808 "},"8":{"x_min":57,"x_max":770,"ha":828,"o":"m 625 516 q 733 416 697 477 q 770 284 770 355 q 675 69 770 161 q 415 -29 574 -29 q 145 65 244 -29 q 57 273 57 150 q 93 413 57 350 q 204 516 130 477 q 112 609 142 556 q 83 718 83 662 q 177 905 83 824 q 414 986 272 986 q 650 904 555 986 q 745 715 745 822 q 716 608 745 658 q 625 516 688 558 m 414 590 q 516 624 479 590 q 553 706 553 659 q 516 791 553 755 q 414 828 480 828 q 311 792 348 828 q 275 706 275 757 q 310 624 275 658 q 414 590 345 590 m 413 135 q 527 179 487 135 q 564 279 564 218 q 525 386 564 341 q 411 436 482 436 q 298 387 341 436 q 261 282 261 344 q 300 178 261 222 q 413 135 340 135 "},"9":{"x_min":58,"x_max":769,"ha":828,"o":"m 769 492 q 646 90 769 232 q 384 -33 539 -33 q 187 35 271 -33 q 83 224 98 107 l 282 224 q 323 154 286 182 q 404 127 359 127 q 513 182 471 127 q 563 384 563 248 q 475 335 532 355 q 372 315 418 315 q 137 416 224 315 q 58 642 58 507 q 144 877 58 781 q 407 984 239 984 q 694 827 602 984 q 769 492 769 699 m 416 476 q 525 521 488 476 q 563 632 563 566 q 521 764 563 709 q 403 826 474 826 q 297 773 337 826 q 258 649 258 720 q 295 530 258 577 q 416 476 339 476 "},"ο":{"x_min":0,"x_max":764,"ha":863,"o":"m 380 -25 q 105 87 211 -25 q 0 372 0 200 q 104 660 0 545 q 380 775 209 775 q 658 659 552 775 q 764 372 764 544 q 658 87 764 200 q 380 -25 552 -25 m 379 142 q 515 216 466 142 q 557 373 557 280 q 515 530 557 465 q 379 607 466 607 q 245 530 294 607 q 204 373 204 465 q 245 218 204 283 q 379 142 294 142 "},"S":{"x_min":0,"x_max":826,"ha":915,"o":"m 826 306 q 701 55 826 148 q 423 -29 587 -29 q 138 60 255 -29 q 0 318 13 154 l 208 318 q 288 192 216 238 q 437 152 352 152 q 559 181 506 152 q 623 282 623 217 q 466 411 623 372 q 176 487 197 478 q 18 719 18 557 q 136 958 18 869 q 399 1040 244 1040 q 670 956 561 1040 q 791 713 791 864 l 591 713 q 526 826 583 786 q 393 866 469 866 q 277 838 326 866 q 218 742 218 804 q 374 617 218 655 q 667 542 646 552 q 826 306 826 471 "},"F":{"x_min":0,"x_max":706.953125,"ha":778,"o":"m 706 837 l 206 837 l 206 606 l 645 606 l 645 431 l 206 431 l 206 0 l 0 0 l 0 1013 l 706 1013 l 706 837 "},"l":{"x_min":41,"x_max":240,"ha":363,"o":"m 240 0 l 41 0 l 41 1013 l 240 1013 l 240 0 "},"o":{"x_min":0,"x_max":764,"ha":871,"o":"m 380 -26 q 105 86 211 -26 q 0 371 0 199 q 104 660 0 545 q 380 775 209 775 q 658 659 552 775 q 764 371 764 544 q 658 86 764 199 q 380 -26 552 -26 m 379 141 q 515 216 466 141 q 557 373 557 280 q 515 530 557 465 q 379 607 466 607 q 245 530 294 607 q 204 373 204 465 q 245 217 204 282 q 379 141 294 141 "},"w":{"x_min":0,"x_max":1056.953125,"ha":1150,"o":"m 1056 749 l 848 0 l 647 0 l 527 536 l 412 0 l 211 0 l 0 749 l 202 749 l 325 226 l 429 748 l 633 748 l 740 229 l 864 749 l 1056 749 "},"s":{"x_min":0,"x_max":681,"ha":775,"o":"m 681 229 q 568 33 681 105 q 340 -29 471 -29 q 107 39 202 -29 q 0 245 0 114 l 201 245 q 252 155 201 189 q 358 128 295 128 q 436 144 401 128 q 482 205 482 166 q 363 284 482 255 q 143 348 181 329 q 25 533 25 408 q 129 716 25 647 q 340 778 220 778 q 554 710 465 778 q 658 522 643 643 l 463 522 q 419 596 458 570 q 327 622 380 622 q 255 606 290 622 q 221 556 221 590 q 339 473 221 506 q 561 404 528 420 q 681 229 681 344 "},"P":{"x_min":0,"x_max":771,"ha":838,"o":"m 208 361 l 208 0 l 0 0 l 0 1013 l 450 1013 q 682 919 593 1013 q 771 682 771 826 q 687 452 771 544 q 466 361 604 361 l 208 361 m 421 837 l 208 837 l 208 544 l 410 544 q 525 579 480 544 q 571 683 571 615 q 527 792 571 747 q 421 837 484 837 "},"c":{"x_min":0,"x_max":751.390625,"ha":828,"o":"m 751 282 q 625 58 725 142 q 384 -26 526 -26 q 107 84 215 -26 q 0 366 0 195 q 98 651 0 536 q 370 774 204 774 q 616 700 518 774 q 751 486 715 626 l 536 486 q 477 570 516 538 q 380 607 434 607 q 248 533 298 607 q 204 378 204 466 q 242 219 204 285 q 377 139 290 139 q 483 179 438 139 q 543 282 527 220 l 751 282 "},"k":{"x_min":0,"x_max":688.890625,"ha":771,"o":"m 688 0 l 450 0 l 270 316 l 196 237 l 196 0 l 0 0 l 0 1013 l 196 1013 l 196 483 l 433 748 l 675 748 l 413 469 l 688 0 "},"e":{"x_min":0,"x_max":708,"ha":808,"o":"m 708 321 l 207 321 q 254 186 207 236 q 362 141 298 141 q 501 227 453 141 l 700 227 q 566 36 662 104 q 362 -26 477 -26 q 112 72 213 -26 q 0 369 0 182 q 95 683 0 573 q 358 793 191 793 q 619 677 531 793 q 708 321 708 561 m 501 453 q 460 571 501 531 q 353 612 420 612 q 247 570 287 612 q 207 453 207 529 l 501 453 "},"t":{"x_min":0,"x_max":412,"ha":511,"o":"m 412 -6 q 349 -8 391 -6 q 287 -11 307 -11 q 137 38 177 -11 q 97 203 97 87 l 97 609 l 0 609 l 0 749 l 97 749 l 97 951 l 297 951 l 297 749 l 412 749 l 412 609 l 297 609 l 297 191 q 315 152 297 162 q 366 143 334 143 q 389 143 378 143 q 412 143 400 143 l 412 -6 "},"M":{"x_min":0,"x_max":1019,"ha":1135,"o":"m 1019 0 l 823 0 l 823 819 l 618 0 l 402 0 l 194 818 l 194 0 l 0 0 l 0 1013 l 309 1012 l 510 241 l 707 1013 l 1019 1013 l 1019 0 "},"a":{"x_min":0,"x_max":700,"ha":786,"o":"m 700 0 l 488 0 q 465 93 469 45 q 365 5 427 37 q 233 -26 303 -26 q 65 37 130 -26 q 0 205 0 101 q 120 409 0 355 q 343 452 168 431 q 465 522 465 468 q 424 588 465 565 q 337 611 384 611 q 250 581 285 611 q 215 503 215 552 l 26 503 q 113 707 26 633 q 328 775 194 775 q 538 723 444 775 q 657 554 657 659 l 657 137 q 666 73 657 101 q 700 33 675 45 l 700 0 m 465 297 l 465 367 q 299 322 358 340 q 193 217 193 287 q 223 150 193 174 q 298 127 254 127 q 417 175 370 127 q 465 297 465 224 "}," ":{"x_min":0,"x_max":0,"ha":375}},"cssFontWeight":"bold","ascender":1216,"underlinePosition":-100,"cssFontStyle":"normal","boundingBox":{"yMin":-333,"xMin":-162,"yMax":1216,"xMax":1681},"resolution":1000,"original_font_information":{"postscript_name":"Helvetiker-Bold","version_string":"Version 1.00 2004 initial release","full_font_name":"Helvetiker Bold","font_family_name":"Helvetiker"},"descender":-334,"familyName":"Helvetiker","lineHeight":1549,"underlineThickness":50};

/** The displacement map samples the actual DOM backdrop in Chromium.
 * Other engines keep CSS glass plus WebGL lighting. All layers leave text crisp.
 * Normal maps rebuild on layout changes; no permanent animation loop runs.
 */
function useGlassOptics(scope: RefObject<HTMLDivElement | null>) {
  const key = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const supportsSVGBackdrop = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute"; svg.style.pointerEvents = "none";
    const defs = document.createElementNS(ns, "defs"); svg.append(defs); root.append(svg);
    const surfaces = Array.from(root.querySelectorAll<HTMLElement>('.g-material:not([data-glass-optics="elastic"])'));

    const sizes = new Map<HTMLElement, string>();
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const build = (el: HTMLElement) => {
      if (!supportsSVGBackdrop) return;
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const style = getComputedStyle(el);
      const strength = parseFloat(style.getPropertyValue("--glass-distortion")) || 0;
      const index = surfaces.indexOf(el), id = `glass-optics-${key}-${index}`;
      const nav = el.closest<HTMLElement>(".g-nav--notched");
      const isNotched = !!nav && el.classList.contains("g-nav-surface");
      const marker = nav?.querySelector<HTMLElement>(".g-nav-indicator");
      const center = marker ? new DOMMatrixReadOnly(getComputedStyle(marker).transform).m41 : w/2;
      const count = nav?.querySelectorAll(".g-nav-links>a").length || 5;
      const scoop = Math.min(55, (w-24)/count*.72, center-4, w-center-4);
      const signature = [w,h,strength,isNotched ? center : 0].join(":");
      if (sizes.get(el) === signature) return;
      sizes.set(el, signature);
      defs.querySelector(`[id="${id}"]`)?.remove();
      const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 26, w/2, h/2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w*.5); canvas.height = Math.ceil(h*.5);
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      const pixels = ctx.createImageData(canvas.width,canvas.height), data = pixels.data;
      const rect = (x: number, y: number, hw: number, hh: number, r: number) => {
        const qx=Math.abs(x)-hw+r, qy=Math.abs(y)-hh+r;
        return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
      };
      const distance = (x: number, y: number) => {
        if (!isNotched) return rect(x-w/2,y-h/2,w/2,h/2,radius);
        const bowl=1-Math.min(Math.abs(x-center)/Math.max(scoop,1),1)**2;
        return Math.max(rect(x-w/2,y-57,w/2,29,29),28+36*bowl*bowl-y);
      };
      const bevel = Math.min(18,h*.25);
      for (let py=0;py<canvas.height;py++) for(let px=0;px<canvas.width;px++) {
        const x=(px+.5)*w/canvas.width, y=(py+.5)*h/canvas.height, d=distance(x,y);
        const bend=d<0 ? Math.sin(Math.min(1,-d/bevel)*Math.PI) : 0;
        const nx=(distance(x+1,y)-distance(x-1,y))*.5, ny=(distance(x,y+1)-distance(x,y-1))*.5;
        const len=Math.hypot(nx,ny)||1, i=(py*canvas.width+px)*4;
        data[i]=128+nx/len*bend*110; data[i+1]=128+ny/len*bend*110; data[i+2]=128; data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);
      const filter=document.createElementNS(ns,"filter");
      Object.entries({id,x:"0",y:"0",width:"100%",height:"100%","color-interpolation-filters":"sRGB"}).forEach(([k,v])=>filter.setAttribute(k,v));
      const map=document.createElementNS(ns,"feImage");
      Object.entries({href:canvas.toDataURL(),width:"100%",height:"100%",preserveAspectRatio:"none",result:"lens"}).forEach(([k,v])=>map.setAttribute(k,v));
      const displacement=document.createElementNS(ns,"feDisplacementMap");
      Object.entries({in:"SourceGraphic",in2:"lens",scale:String(strength),xChannelSelector:"R",yChannelSelector:"G"}).forEach(([k,v])=>displacement.setAttribute(k,v));
      filter.append(map,displacement); defs.append(filter);
      el.style.setProperty("--glass-refraction",`url(#${id})`); el.dataset.refraction = "rim";
    };
    const queue = (el: HTMLElement, delay=80) => {
      clearTimeout(timers.get(el)); timers.set(el,setTimeout(()=>build(el),delay));
    };
    const resize = new ResizeObserver(entries => entries.forEach(entry => {
      const el=entry.target as HTMLElement; queue(el);
    }));
    surfaces.forEach(el=>{build(el);resize.observe(el);});
    const changes = new MutationObserver(records => {
      const active=records.some(record=>record.attributeName==="data-active");
      surfaces.forEach(el=>queue(el,active?520:0));
    });
    changes.observe(root,{attributes:true,attributeFilter:["style","data-theme"]});
    root.querySelectorAll(".g-nav").forEach(nav=>changes.observe(nav,{attributes:true,attributeFilter:["data-active"]}));
    return () => {
      resize.disconnect(); changes.disconnect(); timers.forEach(clearTimeout);
      svg.remove();
      surfaces.forEach(el=>{el.style.removeProperty("--glass-refraction");delete el.dataset.refraction;});
    };
  }, [scope,key]);
}

type GlassSettings = {
  blur: number;
  opacity: number;
  saturation: number;
  tint: string;
  edge: number;
  distortion: number;
};

const defaultGlass: GlassSettings = {
  blur: 2,
  opacity: 0.12,
  saturation: 1.3,
  tint: "#e9dcc9",
  edge: 0.8,
  distortion: 36,
};

type GlassProps = {
  glass?: Partial<GlassSettings>;
  theme?: "light" | "dark";
  accent?: string;
  motion?: boolean;
  className?: string;
  style?: CSSProperties;
};

const finiteRange = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function glassStyle(glass: Partial<GlassSettings> = {}, accent?: string): CSSProperties {
  const tint = glass.tint === undefined ? "var(--color-card, Canvas)" : /^#[0-9a-f]{6}$/i.test(glass.tint) ? glass.tint : defaultGlass.tint;
  const accentLight = accent && /^#[0-9a-f]{6}$/i.test(accent) && (parseInt(accent.slice(1, 3), 16) * 0.299 + parseInt(accent.slice(3, 5), 16) * 0.587 + parseInt(accent.slice(5, 7), 16) * 0.114) > 170;
  return {
    "--glass-blur": `${finiteRange(glass.blur, 2, 0, 40)}px`,
    "--glass-opacity": finiteRange(glass.opacity, 0.12, 0.04, 0.95),
    "--glass-saturation": finiteRange(glass.saturation, 1.3, 0.5, 2),
    "--glass-tint": tint,
    "--glass-edge": finiteRange(glass.edge, 0.8, 0, 1),
    "--glass-distortion": finiteRange(glass.distortion, 36, 0, 60),
    ...(accent ? { "--glass-accent": accent, "--g-accent-ink": accentLight ? "#183022" : "#f4fff5" } : {}),
  } as CSSProperties;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function GlassScope({ children, glass, theme, accent, className = "", style, motion = true }: GlassProps & { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGlassOptics(root);
  return <div ref={root} className={`lgwf ${className}`} data-theme={theme} data-motion={motion ? "on" : "off"} style={{ ...glassStyle(glass, accent), ...style }}><style>{footerStyles}</style>{children}</div>;
}

const PADDING = 32;
type Edge = { value: number; velocity: number; target: number; center: number };
type Point = { x: number; y: number };
type Ripple = Point & { age: number; reach: number };
const RIPPLE_DURATION = 1.25;
const CONTROL_SELECTOR = "a,button,input,textarea,select,[contenteditable]";
const smoothstep = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t*t*(3-2*t); };

/** One pointer lens, one shared material/border path, and four damped edge springs.
 * The material extends into an overscan area so outward pulls contain real glass.
 * No gesture capture, cursor replacement, autonomous waves, or trailing circles.
 */
function GlassFooterMotion({ footerRef, clipId, reduced, intensity, rippleStrength, cursorSize = 32, showCursor = true }: {
  footerRef: RefObject<HTMLElement | null>; clipId: string; reduced: boolean; intensity: number; rippleStrength: number;
  cursorSize?: number; showCursor?: boolean;
}) {
  const diameter = Number.isFinite(cursorSize) ? Math.max(18, Math.min(cursorSize, 56)) : 32;
  const svg = useRef<SVGSVGElement>(null), clip = useRef<SVGPathElement>(null);
  const rim = useRef<SVGPathElement>(null), cursor = useRef<HTMLDivElement>(null);
  const rippleLayer = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const footer=footerRef.current, surface=svg.current, outline=rim.current, clipping=clip.current, lens=cursor.current;
    if (!footer || !surface || !outline || !clipping || !lens) return;
    const amount=Number.isFinite(intensity)?Math.max(0,Math.min(intensity,1.5)):0;
    const strength=Number.isFinite(rippleStrength)?Math.max(0,Math.min(rippleStrength,1.5)):0;
    const enabled=!reduced && amount>0;
    const rippleNodes=Array.from(rippleLayer.current?.querySelectorAll<SVGGElement>(".g-footer-ripple")??[]);
    const rippleCircles=rippleNodes.map(node=>Array.from(node.querySelectorAll("circle")));
    const waves:(Ripple|null)[]=rippleNodes.map(()=>null);
    let nextWave=0;
    const edges: Edge[]=Array.from({length:4},()=>({value:0,velocity:0,target:0,center:0}));
    const pointer={x:0,y:0,targetX:0,targetY:0,visible:0,targetVisible:0,initialized:false};
    let width=1,height=1,radius=28,raf=0,last=0,inView=true,contact:number|null=null;
    let hasPointer=false,disposed=false;
    const round=(n:number)=>Number(n.toFixed(3));
    const p=(point:Point)=>(round(point.x+PADDING)+" "+round(point.y+PADDING));
    function bend(at:number,length:number,edge:Edge){
      const taper=smoothstep((at-radius)/26)*smoothstep((length-radius-at)/26);
      return edge.value*Math.exp(-((at-edge.center)**2)/(2*55*55))*taper;
    }
    function draw(){
      let d="M"+p({x:radius,y:0});
      function curve(point:(t:number)=>Point,length:number){
        const count=Math.max(12,Math.min(90,Math.ceil(length/12))), step=1/count;
        const tangent=(t:number)=>{
          const a=point(t-.001),b=point(t+.001);
          return{x:(b.x-a.x)/.002,y:(b.y-a.y)/.002};
        };
        for(let i=0;i<count;i++){
          const t=i*step,a=point(t),b=point(t+step),ta=tangent(t),tb=tangent(t+step);
          d+=" C"+p({x:a.x+ta.x*step/3,y:a.y+ta.y*step/3})+" "+p({x:b.x-tb.x*step/3,y:b.y-tb.y*step/3})+" "+p(b);
        }
      }
      curve(t=>{const x=radius+t*(width-2*radius);return{x,y:-bend(x,width,edges[0])};},width-2*radius);
      d+=" Q"+p({x:width,y:0})+" "+p({x:width,y:radius});
      curve(t=>{const y=radius+t*(height-2*radius);return{x:width+bend(y,height,edges[1]),y};},height-2*radius);
      d+=" Q"+p({x:width,y:height})+" "+p({x:width-radius,y:height});
      curve(t=>{const x=width-radius-t*(width-2*radius);return{x,y:height+bend(x,width,edges[2])};},width-2*radius);
      d+=" Q"+p({x:0,y:height})+" "+p({x:0,y:height-radius});
      curve(t=>{const y=height-radius-t*(height-2*radius);return{x:-bend(y,height,edges[3]),y};},height-2*radius);
      d+=" Q"+p({x:0,y:0})+" "+p({x:radius,y:0})+" Z";
      outline!.setAttribute("d",d); clipping!.setAttribute("d",d);
    }
    function targets(){
      const locations=[
        {at:pointer.x,out:-pointer.y,length:width},
        {at:pointer.y,out:pointer.x-width,length:height},
        {at:pointer.x,out:pointer.y-height,length:width},
        {at:pointer.y,out:-pointer.x,length:height}
      ];
      locations.forEach(({at,out,length},i)=>{
        const edge=edges[i];
        if(hasPointer && at>radius && at<length-radius && Math.abs(out)<75){
          edge.center=at;
          const proximity=smoothstep(1-Math.abs(out)/75);
          edge.target=Math.max(-12,Math.min(22,12+out*.8))*proximity*amount;
        }else edge.target=0;
      });
    }
    function clearRipples(){
      waves.fill(null);rippleNodes.forEach(node=>{node.style.opacity="0";});
    }
    function ripple(event:PointerEvent){
      if(!enabled||strength===0||!inView||document.hidden||event.button!==0||!event.isPrimary)return;
      if(event.target instanceof Element && event.target.closest(CONTROL_SELECTOR))return;
      const point=locate(event);
      if(point.x<0||point.x>width||point.y<0||point.y>height||!waves.length)return;
      const slot=nextWave++%waves.length;
      waves[slot]={...point,age:0,reach:Math.max(100,Math.min(270,width*.3))};
      rippleNodes[slot].setAttribute("transform",`translate(${point.x+PADDING} ${point.y+PADDING})`);
      rippleNodes[slot].style.opacity="0";
      wake();
    }
    function drawRipples(dt:number){
      waves.forEach((wave,i)=>{
        if(!wave)return;
        wave.age+=dt;
        const progress=Math.min(1,wave.age/RIPPLE_DURATION);
        const radius=18+wave.reach*(1-(1-progress)**2);
        const fadeIn=smoothstep(wave.age/.09);
        rippleNodes[i].style.opacity=String(Math.min(1,strength*.8*fadeIn*(1-progress)**1.4));
        rippleCircles[i].forEach(circle=>circle.setAttribute("r",String(round(radius))));
        if(progress===1){waves[i]=null;rippleNodes[i].style.opacity="0";}
      });
    }
    function tick(now:number){
      raf=0;
      if(disposed||!enabled||!inView||document.hidden){last=0;return;}
      const dt=Math.min(.05,Math.max(.001,(now-(last||now-16.67))/1000)); last=now;
      const follow=1-Math.exp(-18*dt),fade=1-Math.exp(-16*dt);
      pointer.x+=(pointer.targetX-pointer.x)*follow;
      pointer.y+=(pointer.targetY-pointer.y)*follow;
      pointer.visible+=(pointer.targetVisible-pointer.visible)*fade;
      targets();
      const steps=Math.ceil(dt/(1/120)),h=dt/steps;
      for(let step=0;step<steps;step++) for(const edge of edges){
        edge.velocity+=(-260*(edge.value-edge.target)-18*edge.velocity)*h;
        edge.value+=edge.velocity*h;
        if(Math.abs(edge.value)>29){edge.value=Math.sign(edge.value)*29;edge.velocity=0;}
      }
      draw();
      drawRipples(dt);
      lens!.style.transform="translate3d("+round(pointer.x-diameter/2)+"px,"+round(pointer.y-diameter/2)+"px,0)";
      lens!.style.opacity=String(round(pointer.visible));
      const unsettled=edges.some(e=>Math.abs(e.value-e.target)>.015||Math.abs(e.velocity)>.05)
        ||Math.abs(pointer.x-pointer.targetX)+Math.abs(pointer.y-pointer.targetY)>.1
        ||Math.abs(pointer.visible-pointer.targetVisible)>.002||waves.some(Boolean);
      if(unsettled) wake();
      else{
        edges.forEach(e=>{e.value=e.target;e.velocity=0;});draw();
        pointer.visible=pointer.targetVisible;lens!.style.opacity=String(pointer.visible);
        footer!.dataset.meniscusState="idle";last=0;
      }
    }
    function wake(){
      if(enabled&&inView&&!document.hidden&&!disposed&&!raf){
        footer!.dataset.meniscusState="active";raf=requestAnimationFrame(tick);
      }
    }
    function reset(immediate=false){
      hasPointer=false;contact=null;pointer.targetVisible=0;
      edges.forEach(e=>{e.target=0;});
      if(immediate){
        cancelAnimationFrame(raf);raf=0;last=0;pointer.visible=0;pointer.initialized=false;
        clearRipples();
        edges.forEach(e=>{e.value=0;e.velocity=0;});lens!.style.opacity="0";draw();
        footer!.dataset.meniscusState=enabled?"idle":"reduced";
      }else wake();
    }
    function locate(event:PointerEvent){
      const bounds=footer!.getBoundingClientRect();
      return{x:(event.clientX-bounds.left)*width/bounds.width,y:(event.clientY-bounds.top)*height/bounds.height};
    }
    function update(event:PointerEvent){
      if(!enabled||!inView||document.hidden)return;
      const point=locate(event);
      const near=point.x>-75&&point.x<width+75&&point.y>-75&&point.y<height+75;
      if(!near){if(hasPointer)reset();return;}
      const control=event.target instanceof Element && !!event.target.closest(CONTROL_SELECTOR);
      if(!pointer.initialized){
        pointer.x=point.x;pointer.y=point.y;pointer.initialized=true;
      }
      pointer.targetX=point.x;pointer.targetY=point.y;
      pointer.targetVisible=showCursor ? (control ? .18 : 1) : 0;hasPointer=true;wake();
    }
    function move(event:PointerEvent){
      if(event.pointerType==="touch"&&event.pointerId!==contact)return;
      update(event);
    }
    function down(event:PointerEvent){
      ripple(event);
      if(event.pointerType!=="touch"){update(event);return;}
      if(event.target instanceof Element && event.target.closest(CONTROL_SELECTOR))return;
      const point=locate(event);
      if(point.x<-24||point.x>width+24||point.y<-24||point.y>height+24)return;
      contact=event.pointerId;update(event);
    }
    function release(event:PointerEvent){
      if(event.type==="pointercancel"){reset(true);return;}
      if(event.pointerId===contact)reset();
    }
    function leave(event:PointerEvent){if(!event.relatedTarget)reset();}
    function scroll(){if(hasPointer||waves.some(Boolean))reset(true);}
    function visibility(){if(document.hidden)reset(true);}
    function blur(){reset(true);}
    function resize(){
      width=Math.max(1,footer!.offsetWidth);height=Math.max(1,footer!.offsetHeight);
      radius=Math.min(parseFloat(getComputedStyle(footer!).borderTopLeftRadius)||28,width/2,height/2);
      surface!.setAttribute("viewBox","0 0 "+(width+PADDING*2)+" "+(height+PADDING*2));
      reset(true);
    }
    const size=new ResizeObserver(resize);size.observe(footer);resize();
    const intersection=new IntersectionObserver(([entry])=>{
      inView=entry.isIntersecting;if(!inView)reset(true);
    });intersection.observe(footer);
    if(enabled){
      window.addEventListener("pointermove",move,{passive:true});
      window.addEventListener("pointerdown",down,{passive:true});
      window.addEventListener("pointerup",release,{passive:true});
      window.addEventListener("pointercancel",release,{passive:true});
      document.addEventListener("pointerout",leave,{passive:true});
      window.addEventListener("scroll",scroll,{passive:true,capture:true});
      window.addEventListener("blur",blur);
      document.addEventListener("visibilitychange",visibility);
    }
    return()=>{
      disposed=true;cancelAnimationFrame(raf);size.disconnect();intersection.disconnect();
      window.removeEventListener("pointermove",move);window.removeEventListener("pointerdown",down);
      window.removeEventListener("pointerup",release);window.removeEventListener("pointercancel",release);
      document.removeEventListener("pointerout",leave);window.removeEventListener("scroll",scroll,true);
      window.removeEventListener("blur",blur);document.removeEventListener("visibilitychange",visibility);
      lens.style.opacity="0";delete footer.dataset.meniscusState;
      clearRipples();
    };
  },[footerRef,reduced,intensity,rippleStrength,diameter,showCursor]);
  return <>
    <svg ref={svg} className="g-footer-rim g-footer-liquid" viewBox="0 0 1064 664" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path ref={clip}/></clipPath></defs>
      <g ref={rippleLayer} clipPath={`url(#${clipId})`}>
        {[0,1,2].map(index=><g key={index} className="g-footer-ripple" opacity="0">
          <circle className="g-footer-ripple-shadow" cy="1.5" r="0" vectorEffect="non-scaling-stroke"/>
          <circle className="g-footer-ripple-highlight" r="0" vectorEffect="non-scaling-stroke"/>
        </g>)}
      </g>
      <path ref={rim} className="g-footer-wave" vectorEffect="non-scaling-stroke"/>
    </svg>
    <div ref={cursor} className="g-footer-pointer-lens g-material" style={{ width: diameter, height: diameter }} aria-hidden="true"/>
  </>;
}

const font = new FontLoader().parse(typeface);

function FooterGlassWordmark({ text, reduced, depth = .3, intensity = 1, opacity = .18, edge = .65, dark = false, refractionImage, refractionTargetRef, refractionOverlay, tint = "#eee7da", blur = 10 }: {
  text: string; reduced: boolean; depth?: number; intensity?: number; opacity?: number; edge?: number; dark?: boolean; refractionImage?: string; refractionTargetRef?: RefObject<HTMLElement | null>; refractionOverlay?: string; tint?: string; blur?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const refresh = useRef<() => void>(() => {});
  const optics = useRef({ opacity, edge, tint, blur, refractionOverlay });
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    optics.current = { opacity, edge, tint, blur, refractionOverlay };
    refresh.current();
  }, [opacity, edge, tint, blur, refractionOverlay]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      queueMicrotask(() => setAvailable(false));
      return;
    }
    queueMicrotask(() => setAvailable(true));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? "#66726b" : "#e7dfcf");
    const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
    const material = new THREE.MeshPhysicalMaterial({
      color: "white", metalness: 0, roughness: .015, transmission: 1,
      thickness: .95, ior: 1.5, clearcoat: 0, envMapIntensity: .52,
      attenuationColor: "white", attenuationDistance: Infinity,
    });
    const group = new THREE.Group();
    const letters: THREE.Mesh<TextGeometry, THREE.MeshPhysicalMaterial>[] = [];
    let advance = 0;
    for (const character of (text.trim() || "FLOWS").slice(0, 12)) {
      const geometry = new TextGeometry(character, { font, size: 1, depth: Math.max(.08, Math.min(depth, .6)), curveSegments: 18, bevelEnabled: true, bevelSegments: 8, bevelSize: .035, bevelThickness: .065 });
      geometry.computeBoundingBox();
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(advance, -.5, 0);
      advance += size.x + .045;
      letters.push(mesh); group.add(mesh);
    }
    group.position.x = -advance / 2;
    const pivot = new THREE.Group(); pivot.rotation.x = -.055; pivot.add(group); scene.add(pivot);
    const colorTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
    const maskTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 2 });
    const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const composite = new THREE.Scene();
    const quadMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: colorTarget.texture }, mask: { value: maskTarget.texture } },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: `uniform sampler2D color; uniform sampler2D mask; varying vec2 vUv;
        void main(){gl_FragColor=vec4(texture2D(color,vUv).rgb,texture2D(mask,vUv).r);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial); composite.add(quad);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const black = new THREE.Color(0);
    let frame = 0, disposed = false;
    let photo: THREE.CanvasTexture | null = null, original: THREE.Texture | null = null;
    let environment: THREE.WebGLRenderTarget | null = null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    let photograph: HTMLImageElement | null = null;
    const backdrop = document.createElement("canvas"), ctx = backdrop.getContext("2d")!;
    function render() {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0; if (disposed) return;
        renderer.setRenderTarget(colorTarget); renderer.render(scene, camera);
        const background = scene.background;
        scene.background = black; scene.overrideMaterial = maskMaterial;
        renderer.setRenderTarget(maskTarget); renderer.render(scene, camera);
        scene.background = background; scene.overrideMaterial = null;
        renderer.setRenderTarget(null); renderer.render(composite, quadCamera);
      });
    }
    function sampleBackdrop() {
      if (!photograph || !photo) return;
      const box = element!.getBoundingClientRect(), target = refractionTargetRef?.current;
      const ground = (target ?? element!).getBoundingClientRect();
      const cover = Math.max(ground.width / photograph.naturalWidth, ground.height / photograph.naturalHeight);
      const position = target ? getComputedStyle(target).backgroundPosition.split(" ") : ["50%", "50%"];
      const fraction = (value: string | undefined) => value?.endsWith("%") ? parseFloat(value) / 100 : .5;
      backdrop.width = Math.max(1, Math.round(box.width * 1.5));
      backdrop.height = Math.max(1, Math.round(box.height * 1.5));
      ctx.setTransform(1.5, 0, 0, 1.5, 0, 0);
      ctx.drawImage(photograph, (ground.width - photograph.naturalWidth * cover) * fraction(position[0]) - box.x + ground.x, (ground.height - photograph.naturalHeight * cover) * fraction(position[1]) - box.y + ground.y, photograph.naturalWidth * cover, photograph.naturalHeight * cover);
      if (optics.current.refractionOverlay) { ctx.fillStyle = optics.current.refractionOverlay; ctx.fillRect(0, 0, box.width, box.height); }
      photo.needsUpdate = true;
    }
    refresh.current = () => {
      material.envMapIntensity = .3 + optics.current.edge * .5;
      material.color.set("white").lerp(new THREE.Color(optics.current.tint), optics.current.opacity * .025);
      sampleBackdrop(); render();
    };
    if (refractionImage) new THREE.TextureLoader().load(refractionImage, texture => {
      if (disposed) { texture.dispose(); return; }
      original = texture; photograph = texture.image;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      environment = pmrem.fromEquirectangular(texture);
      scene.environment = environment.texture;
      photo = new THREE.CanvasTexture(backdrop); photo.colorSpace = THREE.SRGBColorSpace;
      scene.background = photo;
      sampleBackdrop(); render();
    }, undefined, render);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect(); if (!width || !height) return;
      renderer.setSize(width, height); const dpr = renderer.getPixelRatio();
      colorTarget.setSize(Math.round(width * dpr), Math.round(height * dpr));
      maskTarget.setSize(Math.round(width * dpr), Math.round(height * dpr));
      camera.aspect = width / height;
      camera.position.set(0, .035, Math.max(2.9, advance / (2 * Math.tan(THREE.MathUtils.degToRad(14)) * camera.aspect)) * 1.04 + depth + .15);
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); sampleBackdrop(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const context = gsap.context(() => {});
    const visibility = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      visibility.disconnect();
      if (reduced || intensity <= 0) return;
      context.add(() => {
        gsap.fromTo(letters.map(letter => letter.rotation), { y: -.27 * intensity, x: .12 * intensity }, { y: 0, x: 0, duration: 1.4, stagger: .065, ease: "expo.out", onUpdate: render });
        gsap.fromTo(letters.map(letter => letter.position), { z: -.5 * intensity }, { z: 0, duration: 1.4, stagger: .065, ease: "expo.out", onUpdate: render });
      });
    }, { threshold: .12 }); visibility.observe(element);
    const toX = gsap.quickTo(pivot.rotation, "y", { duration: .8, ease: "power3.out", onUpdate: render });
    const toY = gsap.quickTo(pivot.rotation, "x", { duration: .8, ease: "power3.out", onUpdate: render });
    const move = (event: PointerEvent) => {
      if (reduced || event.pointerType !== "mouse") return;
      const box = element.getBoundingClientRect();
      toX(((event.clientX - box.x) / box.width - .5) * .18 * intensity);
      toY(((event.clientY - box.y) / box.height - .5) * .16 * intensity);
    };
    const leave = () => { toX(0); toY(-.055); };
    element.addEventListener("pointermove", move); element.addEventListener("pointerleave", leave);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); context.revert();
      toX.tween.kill(); toY.tween.kill(); element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", leave);
      letters.forEach(letter => letter.geometry.dispose()); material.dispose(); photo?.dispose(); original?.dispose(); environment?.dispose(); pmrem.dispose();
      colorTarget.dispose(); maskTarget.dispose(); maskMaterial.dispose(); quad.geometry.dispose(); quadMaterial.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); refresh.current = () => {};
    };
  }, [text, reduced, depth, intensity, dark, refractionImage, refractionTargetRef]);
  return <div ref={host} className="g-wordmark-canvas" data-renderer={available ? "webgl" : "fallback"} aria-hidden="true">{!available && <span className="g-wordmark-fallback">{text}</span>}</div>;
}

gsap.registerPlugin(ScrollTrigger, useGSAP);
const Wordmark = FooterGlassWordmark;
export type GlassFooterLinkGroup = { title: string; links: { label: string; href: string }[] };
export type LiquidGlassWordmarkFooterProps = GlassProps & {
  wordmark?: string;
  brand?: string;
  brandIcon?: ReactNode;
  brandHref?: string;
  refractionImage?: string;
  refractionTargetRef?: RefObject<HTMLElement | null>;
  refractionOverlay?: string;
  title?: string;
  description?: string;
  groups: GlassFooterLinkGroup[];
  copyright?: string;
  onSubscribe?: (email: string) => Promise<void>;
  subscriptionNote?: string;
  depth?: number;
  motionIntensity?: number;
  rippleStrength?: number;
  cursorSize?: number;
  showCursor?: boolean;
};

export function LiquidGlassWordmarkFooter({
  wordmark = "Flows", brand = "Your studio", brandIcon, brandHref = "/", refractionImage, refractionTargetRef, refractionOverlay, title = "Make room for what matters.",
  description = "Thoughtful ideas for a more connected business.",
  groups, copyright, onSubscribe, subscriptionNote, depth = 0.3, motionIntensity = 1, rippleStrength = 1, cursorSize = 32, showCursor = true, motion = true, ...props
}: LiquidGlassWordmarkFooterProps) {
  const root = useRef<HTMLElement>(null);
  const formId = useId();
  const clipId = "footer-glass-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const reduced = useReducedMotion() || !motion;
  useGSAP(() => {
    if (reduced) return;
    gsap.from(".g-footer-content", {
      y: 14, duration: 0.8, ease: "expo.out",
      scrollTrigger: { trigger: root.current, start: "top 92%", once: true },
    });
  }, { scope: root, dependencies: [reduced], revertOnUpdate: true });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSubscribe || status === "pending") return;
    const form = event.currentTarget;
    setStatus("pending");
    try {
      await onSubscribe(String(new FormData(form).get("email") ?? ""));
      setStatus("success");
      form.reset();
    } catch { setStatus("error"); }
  }
  return <GlassScope {...props} motion={motion}><div className="g-footer-frame">
    <footer ref={root} className="g-footer" aria-label={brand}>
      <div className="g-footer-surface g-material" data-glass-optics="elastic" aria-hidden="true" style={{ clipPath: `url(#${clipId})` }} />
      <div className="g-footer-content">
        <div className="g-footer-intro">
          <a className="g-footer-brand" href={brandHref} aria-label={brand + " home"}>{brandIcon && <span aria-hidden="true" className="g-footer-brand-icon">{brandIcon}</span>}{brand}</a>
          <h2>{title}</h2><p>{description}</p>
          {onSubscribe && <form className="g-footer-form" onSubmit={submit}>
            <label className="g-visually-hidden" htmlFor={formId}>Email address</label>
            <div className="g-footer-input"><input id={formId} name="email" type="email" placeholder="Your email address" autoComplete="email" required disabled={status === "pending"} /><button type="submit" aria-label="Join the mailing list" disabled={status === "pending"}>{status === "success" ? <Check /> : <ArrowRight />}</button></div>
            {subscriptionNote && <small>{subscriptionNote}</small>}
            <p className="g-footer-status" role="status">{status === "pending" ? "One moment..." : status === "success" ? "Thanks. Your request was received." : status === "error" ? "That did not go through. Please try again." : ""}</p>
          </form>}
        </div>
        <div className="g-footer-links g-material" data-glass-light="static">{groups.map(group => <nav key={group.title} aria-label={group.title}><h3>{group.title}</h3>{group.links.map(link => <a key={link.href} href={link.href}>{link.label}<ArrowUpRight aria-hidden="true" /></a>)}</nav>)}</div>
      </div>
      <div className="g-footer-bottom"><span>{copyright ?? brand}</span><span><span className="g-footer-dot" aria-hidden="true" />Built with care.</span></div>
      <Suspense fallback={<div className="g-wordmark-canvas"><span className="g-wordmark-fallback">{wordmark}</span></div>}>
        <Wordmark text={wordmark} reduced={reduced} depth={depth} intensity={motionIntensity} opacity={props.glass?.opacity} edge={props.glass?.edge} dark={props.theme === "dark"} refractionImage={refractionImage} refractionTargetRef={refractionTargetRef} refractionOverlay={refractionOverlay} tint={props.glass?.tint} blur={props.glass?.blur} />
      </Suspense>
    </footer>
    <GlassFooterMotion footerRef={root} clipId={clipId} reduced={reduced} intensity={motionIntensity} rippleStrength={rippleStrength} cursorSize={cursorSize} showCursor={showCursor} />
  </div></GlassScope>;
}
