float a = 1.0;
float b = 100;
float c = 2.25;

float pad=20, steps=100, sx, sy;

void setup() {
  size(400, 400);
  sx = (width-2*pad)/steps;
  sy = (height-2*pad)/(1+a);
  noLoop();
}

void draw() {
  background(255);
  stroke(0);
  translate(pad, -pad);
  line(0, 0, 0, height);
  line(0, 0, width, 0);

  noFill();
  beginShape();
  for (int i=0; i<steps; i++) {
    vertex(sx * i, sy * compute(i));
  }
  endShape(OPEN);

  fill(0);
  for (float s = 0; s <= 1.0; s += 0.2) {
    text(""+(s*(1+a)), -pad, s * (height - 2*pad));
  }

  stroke(200);
  for (float x = 20; x <= steps; x += 20) {
    float y = compute(x);
    line(sx * x, sy * y, sx * x, -pad);
    line(0, sy * y, sx * x, sy * y);
    text(""+nfc(y, 2), sx * x, sy * y);
    text(""+x, sx * x, -pad);
  }

  println("a", (1+a), "b", b, "c", c);
}

float compute(float x) {
  float r = (steps-x)/steps;
  float v = (1 + a*r) / pow((1 + x/b), c);
  println(a, r, (1+a*r), v, sy);
  return v;
}

boolean ALTERNATE = false;

void keyReleased() {
  if (key == CODED && keyCode == 18) { ALTERNATE = false; }
}

void keyPressed() {
  if (key == CODED && keyCode == 18) { ALTERNATE = true; }
  float step = ALTERNATE ? 0.01 : 0.1;

  boolean r = false;
  if (key == 'a') { a += step; r = true; }
  if (key == 'A') { a -= step; r = true; }
  if (key == 'b') { b += step; r = true; }
  if (key == 'B') { b -= step; r = true; }
  if (key == 'c') { c += step; r = true; }
  if (key == 'C') { c -= step; r = true; }
  if (r) {
    sy = (height-2*pad) / (1+a);
    redraw();
  }

  println((int)key, keyCode);
}

void line(float x1, float y1, float x2, float y2) {
  super.line(x1, height - y1, x2, height - y2);
}

void vertex(float x, float y) {
  super.vertex(x, height - y);
}

void text(String s, float x, float y) {
  super.text(s, x, height - y);
}
