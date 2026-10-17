import java.awt.*;
import java.awt.event.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import javax.swing.*;

public class PhysicsSimulator extends JPanel {
    private static final int WIDTH = 540;
    private static final int HEIGHT = 740;
    private static final int LEFT = 38;
    private static final int RIGHT = 502;
    private static final int TOP = 112;
    private static final int FLOOR = 650;
    private static final int WATERMELON = 10;
    private static final double[] RADII = {16, 21, 27, 34, 41, 48, 55, 63, 72, 82, 94};
    private static final Color[] COLORS = {
        new Color(245, 88, 93), new Color(246, 151, 74), new Color(250, 207, 75),
        new Color(158, 207, 85), new Color(93, 190, 111), new Color(77, 183, 173),
        new Color(89, 159, 220), new Color(143, 123, 209), new Color(219, 112, 170),
        new Color(246, 183, 101), new Color(61, 164, 91)
    };
    private final List<Fruit> fruits = new ArrayList<>();
    private final Random random = new Random();
    private final Timer timer = new Timer(16, e -> tick());
    private Fruit currentFruit;
    private int nextStage;
    private int score;
    private int bestScore;
    private boolean gameOver;
    private long dangerSince;
    private double dropX = (LEFT + RIGHT) / 2.0;

    public PhysicsSimulator() {
        setPreferredSize(new Dimension(WIDTH, HEIGHT));
        setBackground(new Color(17, 24, 39));
        setFocusable(true);
        addKeyListener(new KeyAdapter() {
            @Override
            public void keyPressed(KeyEvent e) {
                handleKey(e);
            }
        });
        addMouseMotionListener(new MouseMotionAdapter() {
            @Override
            public void mouseMoved(MouseEvent e) {
                moveDrop(e.getX());
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                moveDrop(e.getX());
            }
        });
        addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                requestFocusInWindow();
                if (gameOver) {
                    resetGame();
                } else if (e.getY() < FLOOR) {
                    moveDrop(e.getX());
                    dropFruit();
                }
            }
        });
        resetGame();
        timer.start();
    }

    private void resetGame() {
        fruits.clear();
        score = 0;
        gameOver = false;
        dangerSince = 0;
        dropX = (LEFT + RIGHT) / 2.0;
        nextStage = random.nextInt(4);
        spawnFruit();
        repaint();
    }

    private int randomSmallFruit() {
        return random.nextInt(5) == 0 ? 2 : random.nextInt(2);
    }

    private void spawnFruit() {
        double radius = RADII[nextStage];
        dropX = Math.max(LEFT + radius, Math.min(RIGHT - radius, dropX));
        currentFruit = new Fruit(nextStage, dropX, TOP + radius);
        nextStage = randomSmallFruit();
    }

    private void moveDrop(int x) {
        if (gameOver || currentFruit == null) {
            return;
        }
        double radius = currentFruit.radius;
        dropX = Math.max(LEFT + radius, Math.min(RIGHT - radius, x));
        currentFruit.x = dropX;
        repaint();
    }

    private void handleKey(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.VK_R) {
            resetGame();
            return;
        }
        if (gameOver || currentFruit == null) {
            return;
        }
        if (e.getKeyCode() == KeyEvent.VK_LEFT) {
            moveDrop((int) (dropX - 24));
        } else if (e.getKeyCode() == KeyEvent.VK_RIGHT) {
            moveDrop((int) (dropX + 24));
        } else if (e.getKeyCode() == KeyEvent.VK_SPACE || e.getKeyCode() == KeyEvent.VK_DOWN) {
            dropFruit();
        }
    }

    private void dropFruit() {
        if (gameOver || currentFruit == null) {
            return;
        }
        currentFruit.moving = true;
        currentFruit.vy = 1.0;
        fruits.add(currentFruit);
        currentFruit = null;
        spawnFruit();
    }

    private void tick() {
        if (!gameOver) {
            for (Fruit fruit : fruits) {
                if (fruit.moving) {
                    fruit.vy = Math.min(fruit.vy + 0.32, 12);
                    fruit.x += fruit.vx;
                    fruit.y += fruit.vy;
                    fruit.vx *= 0.995;
                    fruit.vy *= 0.999;
                    keepInside(fruit);
                }
            }

            resolveFruitCollisions();
            checkGameOver();
        }
        repaint();
    }

    private void keepInside(Fruit fruit) {
        if (fruit.x - fruit.radius < LEFT) {
            fruit.x = LEFT + fruit.radius;
            fruit.vx = Math.abs(fruit.vx) * 0.25;
        } else if (fruit.x + fruit.radius > RIGHT) {
            fruit.x = RIGHT - fruit.radius;
            fruit.vx = -Math.abs(fruit.vx) * 0.25;
        }
        if (fruit.y + fruit.radius > FLOOR) {
            fruit.y = FLOOR - fruit.radius;
            if (fruit.vy > 1) {
                fruit.vy *= -0.18;
            } else {
                fruit.vy = 0;
                fruit.moving = false;
            }
        }
        if (fruit.y - fruit.radius < TOP) {
            fruit.y = TOP + fruit.radius;
            fruit.vy = Math.max(0, fruit.vy);
        }
    }

    private void resolveFruitCollisions() {
        for (int pass = 0; pass < 4; pass++) {
            boolean merged = false;
            for (int i = 0; i < fruits.size() && !merged; i++) {
                Fruit a = fruits.get(i);
                for (int j = i + 1; j < fruits.size(); j++) {
                    Fruit b = fruits.get(j);
                    double dx = b.x - a.x;
                    double dy = b.y - a.y;
                    double distance = Math.hypot(dx, dy);
                    double minimum = a.radius + b.radius;
                    if (distance >= minimum || distance == 0) {
                        continue;
                    }

                    if (a.stage == b.stage && a.stage < WATERMELON) {
                        Fruit upgraded = new Fruit(a.stage + 1, (a.x + b.x) / 2, (a.y + b.y) / 2);
                        upgraded.moving = true;
                        upgraded.vy = Math.min((a.vy + b.vy) / 2 - 2.0, 0);
                        upgraded.vx = (a.vx + b.vx) / 2;
                        fruits.remove(j);
                        fruits.remove(i);
                        fruits.add(upgraded);
                        score += (a.stage + 1) * 10;
                        bestScore = Math.max(bestScore, score);
                        merged = true;
                        break;
                    }

                    double nx = dx / distance;
                    double ny = dy / distance;
                    double overlap = minimum - distance;
                    double inverseMassA = a.moving ? 1 : 0;
                    double inverseMassB = b.moving ? 1 : 0;
                    double inverseMassTotal = inverseMassA + inverseMassB;
                    if (inverseMassTotal == 0) {
                        continue;
                    }
                    double correction = overlap / inverseMassTotal;
                    a.x -= nx * correction * inverseMassA;
                    a.y -= ny * correction * inverseMassA;
                    b.x += nx * correction * inverseMassB;
                    b.y += ny * correction * inverseMassB;

                    double relativeNormalVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                    if (relativeNormalVelocity < 0) {
                        double impulse = -relativeNormalVelocity * 1.08 / inverseMassTotal;
                        a.vx -= impulse * nx * inverseMassA;
                        a.vy -= impulse * ny * inverseMassA;
                        b.vx += impulse * nx * inverseMassB;
                        b.vy += impulse * ny * inverseMassB;
                    }
                    if (a.moving && !b.moving && Math.abs(a.vy) < 0.7 && ny > 0) {
                        a.vy = 0;
                        a.moving = false;
                    }
                    if (b.moving && !a.moving && Math.abs(b.vy) < 0.7 && ny < 0) {
                        b.vy = 0;
                        b.moving = false;
                    }
                    keepInside(a);
                    keepInside(b);
                }
            }
            if (!merged) {
                break;
            }
        }
    }

    private void checkGameOver() {
        boolean inDanger = false;
        for (Fruit fruit : fruits) {
            if (fruit.y - fruit.radius < TOP + 74) {
                inDanger = true;
                break;
            }
        }
        if (inDanger) {
            if (dangerSince == 0) {
                dangerSince = System.currentTimeMillis();
            } else if (System.currentTimeMillis() - dangerSince > 1800) {
                gameOver = true;
                currentFruit = null;
            }
        } else {
            dangerSince = 0;
        }
    }

    private void drawFruit(Graphics2D g, Fruit fruit) {
        double r = fruit.radius;
        int x = (int) Math.round(fruit.x - r);
        int y = (int) Math.round(fruit.y - r);
        int size = (int) Math.round(r * 2);

        g.setColor(new Color(0, 0, 0, 45));
        g.fillOval(x + 3, y + 5, size, size);
        g.setColor(COLORS[fruit.stage]);
        g.fillOval(x, y, size, size);
        g.setColor(COLORS[fruit.stage].brighter());
        g.fillOval(x + size / 5, y + size / 7, size / 3, size / 4);
        g.setColor(new Color(255, 255, 255, 150));
        g.setStroke(new BasicStroke(2));
        g.drawArc(x + 4, y + 4, size - 8, size - 8, 45, 95);

        if (fruit.stage == WATERMELON) {
            g.setColor(new Color(21, 100, 54));
            g.setStroke(new BasicStroke(3));
            for (int offset = -2; offset <= 2; offset++) {
                int stripeX = (int) fruit.x + offset * 17;
                g.drawArc(stripeX - 24, y + 5, 48, size - 10, 75, 220);
            }
        } else if (fruit.stage >= 3) {
            g.setColor(new Color(66, 108, 51));
            g.setStroke(new BasicStroke(3));
            g.drawLine((int) fruit.x, y + 3, (int) fruit.x + 3, y - 5);
            g.setColor(new Color(96, 178, 83));
            g.fillOval((int) fruit.x + 1, y - 5, 13, 7);
        } else {
            g.setColor(new Color(98, 58, 43));
            g.setStroke(new BasicStroke(2));
            g.drawLine((int) fruit.x, y + 5, (int) fruit.x + 1, y - 4);
        }
    }

    @Override
    protected void paintComponent(Graphics graphics) {
        super.paintComponent(graphics);
        Graphics2D g = (Graphics2D) graphics.create();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setPaint(new GradientPaint(0, 0, new Color(30, 43, 65), 0, HEIGHT, new Color(13, 19, 31)));
        g.fillRect(0, 0, getWidth(), getHeight());

        g.setColor(new Color(255, 255, 255, 230));
        g.setFont(new Font("SansSerif", Font.BOLD, 24));
        g.drawString("FRUIT MERGE", LEFT, 37);
        g.setFont(new Font("SansSerif", Font.BOLD, 18));
        g.drawString("Score  " + score, LEFT, 70);
        g.drawString("Best  " + bestScore, 330, 70);

        g.setColor(new Color(9, 14, 24, 180));
        g.fillRoundRect(LEFT, TOP, RIGHT - LEFT, FLOOR - TOP, 18, 18);
        g.setColor(new Color(114, 145, 182));
        g.setStroke(new BasicStroke(5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.drawLine(LEFT, TOP, LEFT, FLOOR);
        g.drawLine(RIGHT, TOP, RIGHT, FLOOR);
        g.drawLine(LEFT, FLOOR, RIGHT, FLOOR);

        g.setColor(new Color(255, 111, 106, 170));
        g.setStroke(new BasicStroke(2, BasicStroke.CAP_BUTT, BasicStroke.JOIN_ROUND, 1, new float[]{7, 7}, 0));
        g.drawLine(LEFT + 2, TOP + 74, RIGHT - 2, TOP + 74);
        g.setStroke(new BasicStroke(1));

        if (currentFruit != null && !gameOver) {
            g.setColor(new Color(255, 255, 255, 75));
            g.drawLine((int) currentFruit.x, TOP + 5, (int) currentFruit.x, FLOOR - 3);
            drawFruit(g, currentFruit);
        }
        for (Fruit fruit : fruits) {
            drawFruit(g, fruit);
        }

        g.setColor(new Color(255, 255, 255, 185));
        g.setFont(new Font("SansSerif", Font.PLAIN, 14));
        g.drawString("← → move     SPACE / click to drop     R restart", LEFT, HEIGHT - 25);

        if (currentFruit != null && !gameOver) {
            g.setColor(new Color(255, 255, 255, 180));
            g.setFont(new Font("SansSerif", Font.BOLD, 12));
            g.drawString("NEXT", RIGHT - 76, 38);
            drawFruit(g, new Fruit(nextStage, RIGHT - 46, 67));
        }

        if (gameOver) {
            g.setColor(new Color(5, 10, 18, 205));
            g.fillRoundRect(95, 285, WIDTH - 190, 140, 20, 20);
            g.setColor(Color.WHITE);
            g.setFont(new Font("SansSerif", Font.BOLD, 32));
            drawCentered(g, "GAME OVER", 340);
            g.setFont(new Font("SansSerif", Font.PLAIN, 17));
            drawCentered(g, "Score: " + score + "     R or click to play again", 380);
        }
        g.dispose();
    }

    private void drawCentered(Graphics2D g, String text, int y) {
        FontMetrics metrics = g.getFontMetrics();
        g.drawString(text, (WIDTH - metrics.stringWidth(text)) / 2, y);
    }

    private static class Fruit {
        final int stage;
        final double radius;
        double x;
        double y;
        double vx;
        double vy;
        boolean moving;

        Fruit(int stage, double x, double y) {
            this.stage = Math.min(stage, WATERMELON);
            this.radius = RADII[this.stage];
            this.x = x;
            this.y = y;
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame frame = new JFrame("Fruit Merge");
            PhysicsSimulator game = new PhysicsSimulator();
            frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            frame.setContentPane(game);
            frame.pack();
            frame.setResizable(false);
            frame.setLocationRelativeTo(null);
            frame.setVisible(true);
            game.requestFocusInWindow();
        });
    }
}
